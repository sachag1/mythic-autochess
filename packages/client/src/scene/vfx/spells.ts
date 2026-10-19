// Effets visuels des sorts : une recette par sort (nom de l'événement « cast »), composée à
// partir des briques de VfxSystem. Le sort démarre au lancement ; ses effets (dégâts,
// soins…) s'affichent à `impactAt` (voir timeline.ts), c'est donc à ce moment que la
// recette fait tomber l'impact. Un sort inconnu (nouvelle unité) reçoit un effet générique
// déduit de ses effets : type de dégâts, zone, soins, boucliers, étourdissements.
import * as THREE from "three/webgpu";
import type { BattleEvent, DamageType } from "@autochess/sim";
import { unitColor, unitDef } from "../../data/content";
import type { CastGroup } from "../timeline";
import { CAST_IMPACT } from "../characters/Character";
import { rand, type Vec3, type VfxSystem } from "./VfxSystem";

/** Ce qu'un effet peut savoir et faire dans la scène. */
export interface SpellContext {
  vfx: VfxSystem;
  /** Position au sol d'une unité (suivie en direct), ou null si elle a disparu. */
  pos(unit: number): Vec3 | null;
  /** Point d'impact (poitrine) d'une unité. */
  chest(unit: number): Vec3 | null;
  height(unit: number): number;
  defId(unit: number): string;
  /** Unités vivantes d'une équipe (même équipe que `unit` si `same`). */
  units(unit: number, same: boolean): number[];
  /** Copie d'un objet de props.glb (lance, flèche…), ou null. */
  prop(id: string, scale?: number): THREE.Object3D | null;
}

interface Recipe {
  /** Délai entre le lancement et l'impact (ms). */
  impact?: number;
  play(ctx: SpellContext, g: CastInfo): void;
}

/** Données d'un lancement prêtes à l'emploi pour les recettes. */
export interface CastInfo extends CastGroup {
  /** Secondes jusqu'à l'impact. */
  delay: number;
  color: THREE.Color;
  /** Unités touchées par des dégâts ou un étourdissement. */
  hits: number[];
  /** Unités soignées ou protégées. */
  helped: number[];
}

const C = (c: THREE.ColorRepresentation) => new THREE.Color(c);
const up = (p: Vec3, dy: number): Vec3 => ({ x: p.x, y: p.y + dy, z: p.z });
const mid = (a: Vec3, b: Vec3, k = 0.5): Vec3 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
const SKY = 9;
const ROCK_GEO = new THREE.DodecahedronGeometry(0.35, 1);
const ROCK_MAT = new THREE.MeshStandardMaterial({ color: "#7a6a58", roughness: 1, flatShading: true });

// ---------------------------------------------------------------- briques composées

/** Projectile lumineux avec traînée de particules. */
function bolt(ctx: SpellContext, from: Vec3, to: () => Vec3, o: { color: THREE.Color; duration: number; size?: number; arc?: number; trail?: number; mesh?: THREE.Object3D | null; wobble?: number; onArrive?: (p: Vec3) => void; spin?: number }): void {
  const { vfx } = ctx;
  const rate = o.trail ?? 3;
  vfx.projectile({
    from,
    to,
    duration: o.duration,
    arc: o.arc,
    mesh: o.mesh ?? undefined,
    spin: o.spin,
    trail: (p, k) => {
      const w = o.wobble ? Math.sin(k * Math.PI * 4) * o.wobble : 0;
      for (let i = 0; i < rate; i++) vfx.trail({ x: p.x + w, y: p.y, z: p.z + w * 0.5 }, o.color, (o.size ?? 0.22) * rand(0.6, 1.1), 0.35, 3);
      if (!o.mesh) vfx.particle({ x: p.x, y: p.y, z: p.z, life: 0.08, size: (o.size ?? 0.22) * 2.2, color: o.color, intensity: 4 });
    },
    onArrive: o.onArrive,
  });
}

function impact(ctx: SpellContext, at: Vec3, color: THREE.Color, size = 1, o: { decal?: "ring" | "crack" | "star" | "ripple" | "runes" | "disc"; shake?: number; light?: boolean; dust?: boolean; wave?: boolean } = {}): void {
  const { vfx } = ctx;
  vfx.burst(up(at, 0.6), { count: Math.round(26 * size), color, speed: 4 * size, size: 0.18, life: 0.6, intensity: 3 });
  vfx.burst(up(at, 0.6), { count: Math.round(10 * size), color: C("#ffffff"), speed: 2.5 * size, size: 0.1, life: 0.35, intensity: 4 });
  vfx.decal(o.decal ?? "ring", at, { radius: 1.3 * size, color, duration: 0.55 });
  if (o.dust) vfx.dust(at, { count: Math.round(8 * size), color: C("#9a8a74"), radius: 0.3 * size, size: 0.5 * size });
  if (o.light !== false) vfx.light(up(at, 0.5), color, 25 * size, 0.35);
  if (o.shake) vfx.shake(o.shake, 0.3);
  if (o.wave) vfx.shockwave(at, 2.5 * size, 0.45);
}

function slash(ctx: SpellContext, at: Vec3, color: THREE.Color, count = 1, spread = 0.6): void {
  for (let s = 0; s < count; s++) {
    ctx.vfx.after(s * 0.08, () => {
      const a = rand(0, Math.PI);
      for (let i = 0; i < 14; i++) {
        const k = i / 13 - 0.5;
        ctx.vfx.particle({ x: at.x + Math.cos(a) * k * spread * 2, y: at.y + 0.7 + k * spread * 1.2, z: at.z + Math.sin(a) * k * spread * 2, vx: Math.cos(a + 1.57) * 0.8, vy: 0, vz: Math.sin(a + 1.57) * 0.8, life: 0.28, size: 0.16 - Math.abs(k) * 0.12, color, intensity: 5, drag: 3 });
      }
    });
  }
}

function skyStrike(ctx: SpellContext, at: Vec3, color: THREE.Color, o: { width?: number; branches?: number; shake?: number } = {}): void {
  ctx.vfx.lightning({ x: at.x + rand(-1, 1), y: SKY, z: at.z + rand(-1, 1) }, up(at, 0.2), { color, width: o.width ?? 0.06, branches: o.branches ?? 2, duration: 0.35 });
  impact(ctx, at, color, 1, { decal: "crack", shake: o.shake ?? 0.12, wave: true });
}

function beam(ctx: SpellContext, from: Vec3, to: Vec3, color: THREE.Color, duration = 0.3, width = 0.08): void {
  ctx.vfx.lightning(from, to, { color, duration, width, jag: 0.02, branches: 0 });
}

function drain(ctx: SpellContext, from: () => Vec3 | null, to: () => Vec3 | null, color: THREE.Color, duration = 0.6, count = 18): void {
  for (let i = 0; i < count; i++) {
    ctx.vfx.after((i / count) * duration * 0.6, () => {
      const a = from();
      if (!a) return;
      const jitter = { x: a.x + rand(-0.3, 0.3), y: a.y + rand(-0.3, 0.3), z: a.z + rand(-0.3, 0.3) };
      bolt(ctx, jitter, () => to() ?? a, { color, duration: duration * 0.6, size: 0.12, arc: rand(0.2, 0.8), trail: 1 });
    });
  }
}

function areaUnits(ctx: SpellContext, g: CastInfo): number[] {
  return g.hits.length ? g.hits : [g.center];
}

const at = (ctx: SpellContext, u: number) => ctx.pos(u);

// ---------------------------------------------------------------- recettes

const R: Record<string, Recipe> = {
  // -------------------------------------------------------------- Grèce
  "Petrifying Gaze": {
    play(ctx, g) {
      const eyes = () => up(ctx.pos(g.caster)!, ctx.height(g.caster) * 0.85);
      ctx.vfx.after(0.15, () => {
        const t = ctx.chest(g.center);
        if (t) beam(ctx, eyes(), t, C("#7dff8a"), g.delay, 0.05);
      });
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        ctx.vfx.decal("crack", p, { radius: 1.4, color: C("#a8a49a"), duration: 1.2, intensity: 1 });
        ctx.vfx.dust(p, { count: 14, color: C("#8a8478"), radius: 0.4, size: 0.5 });
        ctx.vfx.burst(up(p, 0.8), { count: 18, color: C("#7dff8a"), speed: 2, size: 0.12, intensity: 3 });
      });
    },
  },
  "Pan's Frenzy": {
    impact: 600,
    play(ctx, g) {
      const from = up(ctx.pos(g.caster)!, 1);
      bolt(ctx, from, () => ctx.chest(g.center) ?? from, { color: C("#9adf5a"), duration: g.delay - CAST_IMPACT / 1000, size: 0.12, mesh: ctx.prop("arrow", 0.9), trail: 2, onArrive: (p) => impact(ctx, p, C("#9adf5a"), 0.6, { decal: "star" }) });
      ctx.vfx.after(g.delay, () => {
        const c = ctx.pos(g.caster);
        if (c) for (let i = 0; i < 10; i++) ctx.vfx.particle({ x: c.x + rand(-0.5, 0.5), y: 0.3, z: c.z + rand(-0.5, 0.5), vx: rand(-0.4, 0.4), vy: rand(0.8, 1.5), vz: rand(-0.4, 0.4), life: 1.2, size: 0.1, color: C("#7ad05a"), intensity: 2.5, drag: 0.6 });
      });
    },
  },
  "Boulder Toss": {
    impact: 900,
    play(ctx, g) {
      const rock = new THREE.Mesh(ROCK_GEO, ROCK_MAT);
      rock.castShadow = true;
      const from = up(ctx.pos(g.caster)!, 2);
      ctx.vfx.after(0.3, () =>
        ctx.vfx.projectile({
          from,
          to: () => ctx.pos(g.center) ?? from,
          duration: g.delay - 0.3,
          arc: 3,
          mesh: rock,
          spin: 8,
          trail: (p) => ctx.vfx.particle({ x: p.x, y: p.y, z: p.z, life: 0.5, size: 0.25, endSize: 2, color: C("#8a7a66") }, true),
          onArrive: (p) => {
            impact(ctx, p, C("#c8a070"), 1.3, { decal: "crack", shake: 0.25, dust: true, wave: true });
            ctx.vfx.burst(up(p, 0.3), { count: 20, color: C("#6a5a48"), speed: 5, size: 0.12, gravity: -12, life: 0.9, intensity: 1, alpha: true });
          },
        }),
      );
    },
  },
  "Wrath of Achilles": {
    play(ctx, g) {
      const c = ctx.pos(g.caster);
      if (c) ctx.vfx.rise(c, { count: 20, color: C("#ff5a2a"), radius: 0.6, speed: 2, intensity: 3 });
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        impact(ctx, p, C("#ffc24a"), 1.1, { decal: "crack", shake: 0.15 });
        slash(ctx, p, C("#ffd76a"), 2);
      });
    },
  },
  Aegis: {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.decal("runes", c, { radius: 3.2, color: C("#ffd76a"), duration: 1.6, spin: 0.8, hold: 0.5 });
      ctx.vfx.after(g.delay, () => {
        ctx.vfx.decal("ring", c, { radius: 3.5, color: C("#fff2b0"), duration: 0.6 });
        ctx.vfx.shockwave(c, 4, 0.5);
        ctx.vfx.burst(up(c, 1), { count: 40, color: C("#ffe08a"), speed: 5, size: 0.14, intensity: 3, gravity: 0 });
        ctx.vfx.light(up(c, 1), C("#ffd76a"), 40, 0.5);
        ctx.vfx.shake(0.1);
      });
    },
  },
  "Helm of Darkness": {
    play(ctx, g) {
      const c = ctx.pos(g.caster);
      if (c) ctx.vfx.dust(c, { count: 16, color: C("#1a1426"), radius: 0.4, size: 0.7 });
      ctx.vfx.after(g.delay * 0.6, () => {
        const p = at(ctx, g.center);
        if (p) ctx.vfx.dust(p, { count: 18, color: C("#1a1426"), radius: 0.5, size: 0.8 });
      });
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        impact(ctx, p, C("#7a3aff"), 1.1, { decal: "star", wave: true });
        ctx.vfx.burst(up(p, 0.8), { count: 24, color: C("#2a8aff"), speed: 3, size: 0.2, intensity: 3 });
      });
    },
  },
  Thunderbolt: {
    impact: 520,
    play(ctx, g) {
      const c = ctx.pos(g.caster);
      if (c) ctx.vfx.lightning(up(c, ctx.height(g.caster)), { x: c.x, y: SKY, z: c.z }, { color: C("#bfe0ff"), duration: 0.25, width: 0.04 });
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        ctx.vfx.lightning({ x: p.x, y: SKY + 3, z: p.z }, up(p, 0.2), { color: C("#d8ecff"), duration: 0.5, width: 0.12, branches: 4 });
        for (const u of g.hits) {
          const q = at(ctx, u);
          if (q && u !== g.center) ctx.vfx.lightning(up(p, 0.5), up(q, 0.8), { color: C("#9ad0ff"), duration: 0.3, width: 0.04, branches: 0 });
        }
        impact(ctx, p, C("#9ad0ff"), 1.6, { decal: "crack", shake: 0.35, wave: true });
        ctx.vfx.flash("#cfe6ff", 0.6, 0.25);
      });
    },
  },

  // -------------------------------------------------------------- Nordiques
  "Spear of Valhalla": {
    play(ctx, g) {
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (p) {
          impact(ctx, p, C("#e8f0ff"), 0.9, { decal: "star" });
          slash(ctx, p, C("#bfe0ff"));
        }
        const c = ctx.pos(g.caster);
        if (c) ctx.vfx.rise(c, { count: 14, color: C("#ffffff"), radius: 0.6, speed: 1.2, size: 0.12 });
      });
    },
  },
  "Winter Volley": {
    impact: 700,
    play(ctx, g) {
      for (const [i, u] of areaUnits(ctx, g).entries()) {
        ctx.vfx.after(0.25 + i * 0.05, () => {
          const p = at(ctx, u);
          if (!p) return;
          const from = { x: p.x + rand(-1, 1), y: 6, z: p.z + 2 };
          bolt(ctx, from, () => up(at(ctx, u) ?? p, 0.6), { color: C("#bfe8ff"), duration: g.delay - 0.25 - i * 0.05, size: 0.1, mesh: ctx.prop("arrow", 0.9), trail: 2 });
        });
      }
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        ctx.vfx.decal("crack", p, { radius: 2.4, color: C("#bfe8ff"), duration: 1.2, intensity: 1.5 });
        ctx.vfx.burst(up(p, 0.5), { count: 40, color: C("#eef8ff"), speed: 3, size: 0.1, gravity: -2, intensity: 2 });
      });
    },
  },
  Shapeshift: {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.dust(c, { count: 14, color: C("#3a7a3a"), radius: 0.4, size: 0.6 });
      ctx.vfx.burst(up(c, 0.8), { count: 20, color: C("#7aff6a"), speed: 2, size: 0.12 });
      bolt(ctx, up(c, 1), () => ctx.chest(g.center) ?? c, { color: C("#7aff6a"), duration: g.delay, size: 0.2, wobble: 0.3, onArrive: (p) => impact(ctx, p, C("#7aff6a"), 0.9, { decal: "runes" }) });
    },
  },
  "Falcon Dive": {
    impact: 750,
    play(ctx, g) {
      const p0 = at(ctx, g.center);
      if (!p0) return;
      bolt(ctx, { x: p0.x - 3, y: 7, z: p0.z + 1 }, () => up(at(ctx, g.center) ?? p0, 0.5), {
        color: C("#ffcf6a"),
        duration: g.delay,
        size: 0.35,
        trail: 5,
        onArrive: (p) => {
          impact(ctx, p, C("#ffcf6a"), 1.2, { decal: "star", shake: 0.12 });
          ctx.vfx.burst(up(p, 0.8), { count: 24, color: C("#a8743a"), speed: 3, size: 0.14, gravity: -1.5, intensity: 1.2, life: 1.2, alpha: true });
        },
      });
    },
  },
  Devour: {
    play(ctx, g) {
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        slash(ctx, p, C("#ff2a2a"), 3, 0.8);
        impact(ctx, p, C("#a01020"), 1.2, { decal: "crack", shake: 0.2 });
        const c = ctx.pos(g.caster);
        if (c) ctx.vfx.rise(c, { count: 16, color: C("#ff4a4a"), radius: 0.7 });
      });
    },
  },
  "Thunder God's Wrath": {
    impact: 600,
    play(ctx, g) {
      const c = ctx.pos(g.caster);
      if (c) ctx.vfx.lightning({ x: c.x, y: SKY, z: c.z }, up(c, ctx.height(g.caster) + 0.3), { color: C("#9ad0ff"), duration: 0.3, width: 0.05 });
      ctx.vfx.after(g.delay, () => {
        const units = areaUnits(ctx, g);
        units.forEach((u, i) => ctx.vfx.after(i * 0.05, () => {
          const p = at(ctx, u);
          if (p) skyStrike(ctx, p, C("#a8d8ff"), { width: u === g.center ? 0.12 : 0.06, shake: 0.3 });
        }));
        ctx.vfx.flash("#bfe0ff", 0.5, 0.3);
      });
    },
  },
  "Barrow Curse": {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.decal("runes", c, { radius: 2.4, color: C("#5affb0"), duration: 1.2, spin: -1.5 });
      ctx.vfx.after(g.delay, () => {
        for (const u of g.hits) {
          const p = at(ctx, u);
          if (p) bolt(ctx, up(c, 1), () => up(at(ctx, u) ?? p, 0.8), { color: C("#5affb0"), duration: 0.25, size: 0.18, wobble: 0.2, onArrive: (q) => ctx.vfx.burst(q, { count: 14, color: C("#5affb0"), speed: 2, size: 0.14 }) });
        }
      });
    },
  },

  // -------------------------------------------------------------- Égypte
  "Nine Lives": {
    play(ctx, g) {
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (p) {
          slash(ctx, p, C("#c78aff"), 3, 0.7);
          impact(ctx, p, C("#b05cff"), 0.7);
        }
        const c = ctx.pos(g.caster);
        if (c) ctx.vfx.rise(c, { count: 18, color: C("#ffd76a"), radius: 0.5, speed: 2.2, size: 0.08 });
      });
    },
  },
  "Death Roll": {
    play(ctx, g) {
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        ctx.vfx.decal("ripple", p, { radius: 2, color: C("#4ab0ff"), duration: 1.2, from: 0.2 });
        ctx.vfx.burst(up(p, 0.3), { count: 40, color: C("#8fd4ff"), speed: 4, size: 0.1, gravity: -9, life: 0.9, up: 2 });
        ctx.vfx.shake(0.12);
      });
    },
  },
  Bloodlust: {
    impact: 300,
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.decal("ring", c, { radius: 2.2, color: C("#ff3a2a"), duration: 0.6 });
      ctx.vfx.shockwave(c, 3, 0.4);
      for (let i = 0; i < 6; i++) ctx.vfx.after(i * 0.1, () => {
        const q = ctx.pos(g.caster);
        if (q) ctx.vfx.rise(q, { count: 8, color: C("#ff3a1a"), radius: 0.6, speed: 2.5, size: 0.16 });
      });
    },
  },
  "Weighing of the Heart": {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.decal("runes", c, { radius: 4.2, color: C("#ffcf4a"), duration: 1.4, spin: 0.6, hold: 0.4 });
      ctx.vfx.pillar(c, { radius: 0.5, height: 5, color: C("#ffcf4a"), duration: 0.9 });
      ctx.vfx.after(g.delay, () => {
        for (const u of g.hits) {
          const p = at(ctx, u);
          if (p) {
            ctx.vfx.burst(up(p, 0.6), { count: 16, color: C("#e8c47a"), speed: 2.5, size: 0.12 });
            ctx.vfx.particle({ x: p.x, y: 2.4, z: p.z, vy: -0.6, life: 1.4, size: 0.3, color: C("#ffffff"), intensity: 2 });
          }
        }
        ctx.vfx.shockwave(c, 5, 0.6);
      });
    },
  },
  "Breath of Life": {
    play(ctx, g) {
      ctx.vfx.after(g.delay * 0.4, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        ctx.vfx.pillar(p, { radius: 0.6, height: 6, color: C("#ffe9a0"), duration: 1.2, scroll: -4 });
        ctx.vfx.decal("runes", p, { radius: 1.8, color: C("#ffd76a"), duration: 1.3, spin: 1 });
      });
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (p) ctx.vfx.rise(p, { count: 30, color: C("#fff2b0"), radius: 0.7, speed: 1.8 });
      });
    },
  },
  Sandstorm: {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.during(1.4, (k) => {
        const q = ctx.pos(g.caster) ?? c;
        for (let i = 0; i < 3; i++) {
          const a = k * 25 + i * 2.1;
          const r = 0.8 + Math.sin(k * 9 + i) * 0.6;
          ctx.vfx.particle({ x: q.x + Math.cos(a) * r, y: 0.2 + Math.random() * 1.6, z: q.z + Math.sin(a) * r, vx: -Math.sin(a) * 3, vz: Math.cos(a) * 3, life: 0.6, size: 0.5, endSize: 2, color: C("#d8b070"), drag: 2 }, true);
        }
      });
      ctx.vfx.after(g.delay, () => ctx.vfx.decal("ring", c, { radius: 2.4, color: C("#e8a050"), duration: 0.6 }));
    },
  },
  "Solar Flare": {
    impact: 700,
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.pillar(c, { radius: 0.8, height: 9, color: C("#ffc24a"), duration: 1.4, intensity: 4 });
      ctx.vfx.decal("star", c, { radius: 4, color: C("#ffb02a"), duration: 1.4 });
      ctx.vfx.after(g.delay, () => {
        ctx.vfx.flash("#ffd27a", 0.7, 0.4);
        ctx.vfx.shake(0.2, 0.4);
        for (const u of ctx.units(g.caster, false)) {
          const p = at(ctx, u);
          if (p) {
            ctx.vfx.pillar(p, { radius: 0.45, height: 9, color: C("#ff9a2a"), duration: 0.7, intensity: 5 });
            ctx.vfx.burst(up(p, 0.5), { count: 16, color: C("#ffb02a"), speed: 3, size: 0.14, intensity: 4 });
          }
        }
        for (const u of ctx.units(g.caster, true)) {
          const p = at(ctx, u);
          if (p) ctx.vfx.rise(p, { count: 12, color: C("#fff0a0"), radius: 0.6 });
        }
      });
    },
  },

  // -------------------------------------------------------------- Japon
  Foxfire: {
    impact: 750,
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const from = { x: c.x + Math.cos(a) * 0.7, y: 1.3, z: c.z + Math.sin(a) * 0.7 };
        ctx.vfx.after(0.1 * i, () => bolt(ctx, from, () => ctx.chest(g.center) ?? from, { color: C("#6ad8ff"), duration: g.delay - 0.1 * i, size: 0.3, arc: 1.2, wobble: 0.25, trail: 4 }));
      }
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (p) impact(ctx, p, C("#6ad8ff"), 1.3, { decal: "ring", wave: true });
      });
    },
  },
  "Gale Slash": {
    play(ctx, g) {
      ctx.vfx.after(g.delay * 0.5, () => {
        const a = ctx.chest(g.caster);
        const b = ctx.chest(g.center);
        if (!a || !b) return;
        for (let i = 0; i < 30; i++) {
          const q = mid(a, b, i / 29);
          ctx.vfx.particle({ x: q.x, y: q.y + rand(-0.2, 0.2), z: q.z, vx: rand(-0.3, 0.3), vy: rand(0, 0.5), vz: rand(-0.3, 0.3), life: 0.4, size: 0.1, color: C("#d8ffe8"), intensity: 3, delay: i * 0.004 });
        }
      });
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        slash(ctx, p, C("#e8fff0"), 2, 0.9);
        ctx.vfx.burst(up(p, 0.8), { count: 14, color: C("#6ab04a"), speed: 3, size: 0.1, gravity: -1, life: 1.2, intensity: 1.2, alpha: true });
      });
    },
  },
  "River Ambush": {
    play(ctx, g) {
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        ctx.vfx.pillar(p, { radius: 0.4, height: 2.5, color: C("#5ab8ff"), duration: 0.6, scroll: 14 });
        ctx.vfx.burst(up(p, 0.2), { count: 36, color: C("#a8e0ff"), speed: 3, up: 4, size: 0.1, gravity: -12, life: 1 });
        ctx.vfx.decal("ripple", p, { radius: 1.6, color: C("#5ab8ff"), duration: 1 });
      });
    },
  },
  "Thunder Drums": {
    impact: 650,
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      for (let i = 0; i < 3; i++) ctx.vfx.after(i * 0.15, () => {
        ctx.vfx.decal("ring", c, { radius: 2 + i, color: C("#ffe14d"), duration: 0.5 });
        ctx.vfx.shake(0.06, 0.15);
      });
      ctx.vfx.after(g.delay, () => {
        for (const u of areaUnits(ctx, g)) {
          const p = at(ctx, u);
          if (p) skyStrike(ctx, p, C("#ffe96a"), { width: 0.07, shake: 0.18 });
        }
      });
    },
  },
  "Storm Blade": {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.during(0.6, (k) => {
        const q = ctx.pos(g.caster) ?? c;
        const a = k * Math.PI * 4;
        for (let i = 0; i < 2; i++) ctx.vfx.particle({ x: q.x + Math.cos(a + i * Math.PI) * 1.3, y: 0.8, z: q.z + Math.sin(a + i * Math.PI) * 1.3, life: 0.35, size: 0.22, color: C("#9ad8ff"), intensity: 4 });
      });
      ctx.vfx.after(g.delay, () => {
        ctx.vfx.decal("ring", c, { radius: 2.4, color: C("#bfe8ff"), duration: 0.5 });
        for (const u of g.hits) {
          const p = at(ctx, u);
          if (p) ctx.vfx.lightning(up(c, 0.8), up(p, 0.8), { color: C("#bfe0ff"), duration: 0.25, width: 0.04, branches: 1 });
        }
        ctx.vfx.shockwave(c, 3, 0.4);
      });
    },
  },
  "Frozen Breath": {
    play(ctx, g) {
      ctx.vfx.during(g.delay, () => {
        const a = ctx.chest(g.caster);
        const b = ctx.chest(g.center);
        if (!a || !b) return;
        for (let i = 0; i < 4; i++) {
          const dx = b.x - a.x, dz = b.z - a.z;
          ctx.vfx.particle({ x: a.x, y: a.y + 0.2, z: a.z, vx: dx * rand(1.6, 2.2) + rand(-0.6, 0.6), vy: rand(-0.3, 0.3), vz: dz * rand(1.6, 2.2) + rand(-0.6, 0.6), life: 0.5, size: 0.15, endSize: 4, color: C("#cfeeff"), intensity: 1.6, drag: 1.5 });
        }
      });
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        ctx.vfx.decal("crack", p, { radius: 2.2, color: C("#bfe8ff"), duration: 1.6, intensity: 1.6 });
        ctx.vfx.burst(up(p, 0.8), { count: 30, color: C("#eef8ff"), speed: 3, size: 0.1, intensity: 2 });
      });
    },
  },
  "Eight Heads": {
    play(ctx, g) {
      ctx.vfx.after(g.delay, () => {
        for (const [i, u] of g.hits.entries()) ctx.vfx.after(i * 0.06, () => {
          const p = at(ctx, u);
          if (p) {
            slash(ctx, p, C("#ff3a2a"), 1, 0.5);
            ctx.vfx.burst(up(p, 0.7), { count: 12, color: C("#b0101a"), speed: 2, size: 0.14 });
          }
        });
        const c = ctx.pos(g.caster);
        if (c) ctx.vfx.rise(c, { count: 20, color: C("#ff6a5a"), radius: 1 });
      });
    },
  },

  // -------------------------------------------------------------- Chine
  Gluttony: {
    play(ctx, g) {
      ctx.vfx.after(g.delay, () => {
        const c = ctx.pos(g.caster);
        if (!c) return;
        ctx.vfx.rise(c, { count: 18, color: C("#8aff7a"), radius: 0.6 });
        impact(ctx, c, C("#d8a060"), 1.2, { decal: "crack", shake: 0.15, dust: true });
      });
    },
  },
  "Qi Drain": {
    play(ctx, g) {
      drain(ctx, () => ctx.chest(g.center), () => ctx.chest(g.caster), C("#c8ffd8"), g.delay + 0.4, 16);
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (p) ctx.vfx.decal("runes", p, { radius: 1.2, color: C("#f2d24a"), duration: 0.8 });
      });
    },
  },
  "Wind Fire Wheels": {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.during(0.7, (k) => {
        const q = ctx.pos(g.caster) ?? c;
        for (let i = 0; i < 3; i++) {
          const a = k * Math.PI * 6 + (i * Math.PI * 2) / 3;
          ctx.vfx.particle({ x: q.x + Math.cos(a) * 1.2, y: 0.4, z: q.z + Math.sin(a) * 1.2, vy: 0.8, life: 0.45, size: 0.3, endSize: 0.3, color: C("#ff7a1a"), intensity: 4 });
        }
      });
      ctx.vfx.after(g.delay, () => ctx.vfx.decal("ring", c, { radius: 2.4, color: C("#ff8a2a"), duration: 0.6 }));
    },
  },
  "River Guard": {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.decal("ripple", c, { radius: 3, color: C("#5ab8ff"), duration: 1.4, from: 0.1 });
      ctx.vfx.after(g.delay, () => {
        for (const u of g.helped) {
          const p = at(ctx, u);
          if (p) ctx.vfx.burst(up(p, 0.2), { count: 16, color: C("#8fd4ff"), speed: 1.5, up: 3, size: 0.1, gravity: -8 });
        }
      });
    },
  },
  Sunshooter: {
    impact: 620,
    play(ctx, g) {
      const from = up(ctx.pos(g.caster)!, 1.1);
      ctx.vfx.after(0.25, () => bolt(ctx, from, () => ctx.chest(g.center) ?? from, { color: C("#ff9a2a"), duration: g.delay - 0.25, size: 0.3, trail: 6, mesh: ctx.prop("arrow", 1.1), onArrive: (p) => impact(ctx, p, C("#ffb02a"), 1.2, { decal: "star", wave: true }) }));
      ctx.vfx.light(up(from, 0.3), C("#ffb02a"), 20, 0.4);
    },
  },
  "Third Eye": {
    play(ctx, g) {
      ctx.vfx.after(0.12, () => {
        const a = up(ctx.pos(g.caster)!, ctx.height(g.caster) * 0.9);
        const b = ctx.chest(g.center);
        if (b) beam(ctx, a, b, C("#ffe46a"), g.delay - 0.12 + 0.1, 0.07);
      });
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (p) impact(ctx, p, C("#ffe46a"), 1.2, { decal: "star", wave: true });
      });
    },
  },
  "Seventy-Two Transformations": {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.vfx.burst({ x: c.x + Math.cos(a) * 0.8, y: 1, z: c.z + Math.sin(a) * 0.8 }, { count: 10, color: C("#ffd23a"), speed: 1.2, size: 0.18, alpha: false });
      }
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (p) impact(ctx, p, C("#ffd23a"), 1.4, { decal: "crack", shake: 0.25, dust: true, wave: true });
      });
    },
  },

  // -------------------------------------------------------------- Celtes
  "Tidal Song": {
    impact: 750,
    play(ctx, g) {
      const from = up(ctx.pos(g.caster)!, 1.2);
      bolt(ctx, from, () => ctx.chest(g.center) ?? from, { color: C("#6ac8ff"), duration: g.delay, size: 0.18, arc: 1.5, trail: 4, onArrive: (p) => {
        ctx.vfx.decal("ripple", { x: p.x, y: 0, z: p.z }, { radius: 1.4, color: C("#6ac8ff"), duration: 0.9 });
        ctx.vfx.burst(p, { count: 16, color: C("#bfe8ff"), speed: 2, size: 0.1, gravity: -6 });
      } });
    },
  },
  "Gae Bulg": {
    impact: 560,
    play(ctx, g) {
      const from = up(ctx.pos(g.caster)!, 1.3);
      ctx.vfx.after(0.28, () => bolt(ctx, from, () => ctx.chest(g.center) ?? from, { color: C("#ff2a3a"), duration: g.delay - 0.28, size: 0.16, trail: 5, mesh: ctx.prop("q_spear", 0.3), onArrive: (p) => {
        impact(ctx, p, C("#ff2a3a"), 1, { decal: "star", shake: 0.12 });
        ctx.vfx.burst(p, { count: 18, color: C("#300808"), speed: 3, size: 0.16, alpha: true });
      } }));
    },
  },
  "Crow Swarm": {
    impact: 800,
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      for (let i = 0; i < 16; i++) {
        ctx.vfx.after(i * 0.025, () => {
          const target = at(ctx, g.center);
          if (!target) return;
          const from = { x: c.x + rand(-0.5, 0.5), y: 1.5 + rand(0, 0.8), z: c.z + rand(-0.5, 0.5) };
          ctx.vfx.projectile({
            from,
            to: () => ({ x: target.x + rand(-1.5, 1.5), y: 0.8 + rand(0, 1), z: target.z + rand(-1.5, 1.5) }),
            duration: g.delay - i * 0.025,
            arc: rand(0.5, 2),
            trail: (p) => ctx.vfx.particle({ x: p.x, y: p.y, z: p.z, life: 0.25, size: 0.22, endSize: 0.5, color: C("#141018") }, true),
          });
        });
      }
      ctx.vfx.after(g.delay, () => {
        for (const u of g.hits) {
          const p = at(ctx, u);
          if (p) ctx.vfx.burst(up(p, 0.9), { count: 12, color: C("#9a5aff"), speed: 2, size: 0.12 });
        }
        const p = at(ctx, g.center);
        if (p) ctx.vfx.decal("runes", p, { radius: 4, color: C("#7a3aff"), duration: 1 });
      });
    },
  },
  "Keening Wail": {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      for (let i = 0; i < 4; i++) ctx.vfx.after(i * 0.12, () => ctx.vfx.decal("ring", c, { radius: 2 + i * 0.6, color: C("#dfe8ff"), duration: 0.7 }));
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        for (let i = 0; i < 3; i++) ctx.vfx.after(i * 0.1, () => ctx.vfx.decal("ring", p, { radius: 2.4, color: C("#cfe0ff"), duration: 0.6 }));
        ctx.vfx.shockwave(p, 3.5, 0.6);
        ctx.vfx.rise(p, { count: 20, color: C("#dfe8ff"), radius: 1.2, speed: 2.5 });
      });
    },
  },
  "Cauldron of Plenty": {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.burst(up(c, 1.2), { count: 30, color: C("#7ef07a"), speed: 2, up: 3, size: 0.14, gravity: -5 });
      ctx.vfx.after(g.delay, () => {
        for (const u of ctx.units(g.caster, true)) {
          const p = at(ctx, u);
          if (p) {
            ctx.vfx.rise(p, { count: 14, color: C("#8aff7a"), radius: 0.6 });
            ctx.vfx.decal("disc", p, { radius: 0.9, color: C("#7ef07a"), duration: 0.8 });
          }
        }
      });
    },
  },
  "Wild Growth": {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.decal("runes", c, { radius: 2.6, color: C("#7ad05a"), duration: 1.4, spin: 0.7 });
      ctx.vfx.after(g.delay, () => {
        for (const u of ctx.units(g.caster, true)) {
          const p = at(ctx, u);
          if (!p) continue;
          for (let i = 0; i < 12; i++) ctx.vfx.particle({ x: p.x + rand(-0.6, 0.6), y: 0.1, z: p.z + rand(-0.6, 0.6), vx: rand(-0.3, 0.3), vy: rand(1, 2), vz: rand(-0.3, 0.3), life: 1.3, size: 0.12, color: i % 3 ? C("#6ad04a") : C("#ff9ac8"), intensity: 2, drag: 0.8, delay: rand(0, 0.3) });
        }
      });
    },
  },
  "Spear of Assal": {
    impact: 600,
    play(ctx, g) {
      const from = up(ctx.pos(g.caster)!, 1.3);
      ctx.vfx.after(0.28, () => bolt(ctx, from, () => ctx.chest(g.center) ?? from, { color: C("#ffe08a"), duration: g.delay - 0.28, size: 0.25, trail: 6, mesh: ctx.prop("q_spear", 0.3), onArrive: (p) => {
        impact(ctx, p, C("#ffe08a"), 1.5, { decal: "star", wave: true, shake: 0.18 });
        ctx.vfx.flash("#fff0b0", 0.25, 0.2);
      } }));
    },
  },

  // -------------------------------------------------------------- Aztèques
  "Underworld Guide": {
    play(ctx, g) {
      drain(ctx, () => ctx.chest(g.center), () => ctx.chest(g.caster), C("#6a5aff"), g.delay + 0.4, 14);
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (p) ctx.vfx.burst(up(p, 0.8), { count: 14, color: C("#4a3aff"), speed: 2, size: 0.14 });
      });
    },
  },
  "Obsidian Claws": {
    play(ctx, g) {
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (!p) return;
        slash(ctx, p, C("#ff3a3a"), 3, 0.6);
        ctx.vfx.burst(up(p, 0.8), { count: 16, color: C("#120c10"), speed: 3, size: 0.12, alpha: true });
      });
    },
  },
  "Healing Rain": {
    impact: 600,
    play(ctx, g) {
      const p0 = at(ctx, g.center);
      if (!p0) return;
      ctx.vfx.during(1.4, (k) => {
        const p = at(ctx, g.center) ?? p0;
        if (k < 0.85) ctx.vfx.particle({ x: p.x + rand(-1.2, 1.2), y: 3.2, z: p.z + rand(-1.2, 1.2), vx: rand(-0.1, 0.1), vy: 0, vz: rand(-0.1, 0.1), life: 0.9, size: 0.9, endSize: 1.4, color: C("#5a6a8a") }, true);
        for (let i = 0; i < 3; i++) ctx.vfx.particle({ x: p.x + rand(-1.3, 1.3), y: 3, z: p.z + rand(-1.3, 1.3), vy: -7, life: 0.42, size: 0.05, color: C("#9fd8ff"), intensity: 3 });
      });
      ctx.vfx.after(g.delay, () => {
        for (const u of g.helped) {
          const p = at(ctx, u);
          if (p) ctx.vfx.decal("ripple", p, { radius: 1.2, color: C("#6ac8ff"), duration: 1 });
        }
      });
    },
  },
  Xiuhcoatl: {
    impact: 700,
    play(ctx, g) {
      const from = up(ctx.pos(g.caster)!, 1);
      ctx.vfx.after(0.2, () => bolt(ctx, from, () => ctx.chest(g.center) ?? from, { color: C("#ff6a1a"), duration: g.delay - 0.2, size: 0.32, trail: 6, wobble: 0.5, onArrive: (p) => {
        impact(ctx, p, C("#ff6a1a"), 1.4, { decal: "crack", shake: 0.15, wave: true });
        ctx.vfx.burst(p, { count: 20, color: C("#1fd8c8"), speed: 3, size: 0.12 });
      } }));
    },
  },
  "Bone Harvest": {
    play(ctx, g) {
      ctx.vfx.after(g.delay * 0.5, () => {
        const p = at(ctx, g.center);
        if (p) slash(ctx, p, C("#e8e0d0"), 1, 1);
      });
      ctx.vfx.after(g.delay, () => {
        const p = ctx.chest(g.center);
        if (!p) return;
        for (const u of ctx.units(g.caster, true)) bolt(ctx, p, () => ctx.chest(u) ?? p, { color: C("#ff8a5a"), duration: 0.6, size: 0.12, arc: 1.2, trail: 2, onArrive: (q) => ctx.vfx.rise({ x: q.x, y: 0, z: q.z }, { count: 8, color: C("#ffb08a"), radius: 0.4 }) });
      });
    },
  },
  "Feathered Serpent": {
    impact: 650,
    play(ctx, g) {
      ctx.vfx.after(0.15, () => {
        const p0 = at(ctx, g.center);
        if (!p0) return;
        ctx.vfx.during(1.2, (k) => {
          const p = at(ctx, g.center) ?? p0;
          for (let i = 0; i < 4; i++) {
            const a = k * 30 + i * 1.57;
            const r = 0.3 + k * 2;
            ctx.vfx.particle({ x: p.x + Math.cos(a) * r, y: 0.2 + k * 2.5 + Math.random() * 0.4, z: p.z + Math.sin(a) * r, vx: -Math.sin(a) * 2, vz: Math.cos(a) * 2, life: 0.5, size: 0.16, color: i % 2 ? C("#3cd8a0") : C("#e8c13a"), intensity: 2.5, drag: 2 });
          }
        });
      });
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (p) ctx.vfx.decal("ring", p, { radius: 4.4, color: C("#3cd8a0"), duration: 0.8 });
      });
    },
  },
  "Smoking Mirror": {
    play(ctx, g) {
      const from = ctx.chest(g.caster)!;
      bolt(ctx, from, () => ctx.chest(g.center) ?? from, { color: C("#9a5aff"), duration: g.delay, size: 0.25, trail: 3, onArrive: (p) => {
        impact(ctx, p, C("#9a5aff"), 1, { decal: "runes" });
        ctx.vfx.dust({ x: p.x, y: 0, z: p.z }, { count: 14, color: C("#1a1420"), radius: 0.3, size: 0.6 });
      } });
      for (let i = 0; i < 8; i++) ctx.vfx.particle({ x: from.x, y: from.y, z: from.z, vy: rand(0.4, 1), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), life: 1.2, size: 0.3, endSize: 3, color: C("#2a2030") }, true);
    },
  },

  // -------------------------------------------------------------- Mésopotamie
  Gatekeeper: {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.decal("runes", c, { radius: 2.4, color: C("#ffcf4a"), duration: 1.2, spin: 1 });
      ctx.vfx.after(g.delay, () => {
        ctx.vfx.decal("ring", c, { radius: 2.6, color: C("#ffe08a"), duration: 0.5 });
        ctx.vfx.shockwave(c, 3, 0.4);
        ctx.vfx.shake(0.12);
      });
    },
  },
  "Wild Charge": {
    play(ctx, g) {
      ctx.vfx.during(g.delay, () => {
        const c = ctx.pos(g.caster);
        if (c) ctx.vfx.dust(c, { count: 1, color: C("#a08a6a"), radius: 0.2, size: 0.4, speed: 0.5 });
      });
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center);
        if (p) impact(ctx, p, C("#e8b070"), 1.2, { decal: "crack", shake: 0.22, dust: true, wave: true });
      });
    },
  },
  "Venom Sting": {
    impact: 620,
    play(ctx, g) {
      const from = up(ctx.pos(g.caster)!, 1.6);
      bolt(ctx, from, () => ctx.chest(g.center) ?? from, { color: C("#a8ff3a"), duration: g.delay, size: 0.18, arc: 1, trail: 3, onArrive: (p) => {
        ctx.vfx.burst(p, { count: 18, color: C("#a8ff3a"), speed: 2, size: 0.12, gravity: -6 });
        for (let i = 0; i < 8; i++) ctx.vfx.particle({ x: p.x + rand(-0.4, 0.4), y: p.y, z: p.z + rand(-0.4, 0.4), vy: 0.3, life: 1.4, size: 0.4, endSize: 2.5, color: C("#5a8a2a") }, true);
      } });
    },
  },
  "Morning Star": {
    impact: 650,
    play(ctx, g) {
      const from = up(ctx.pos(g.caster)!, 1.2);
      ctx.vfx.after(0.2, () => bolt(ctx, from, () => ctx.chest(g.center) ?? from, { color: C("#ffd8f0"), duration: g.delay - 0.2, size: 0.28, trail: 5, onArrive: (p) => impact(ctx, p, C("#ffb8e8"), 1, { decal: "star" }) }));
    },
  },
  "Primordial Flood": {
    impact: 700,
    play(ctx, g) {
      const p0 = at(ctx, g.center);
      if (!p0) return;
      ctx.vfx.decal("ripple", p0, { radius: 4.5, color: C("#2a9aff"), duration: 1.6, from: 0.05 });
      ctx.vfx.after(g.delay, () => {
        const p = at(ctx, g.center) ?? p0;
        for (let i = 0; i < 3; i++) ctx.vfx.after(i * 0.1, () => ctx.vfx.burst(up(p, 0.1), { count: 50, color: C("#7fd0ff"), speed: 5, up: 4, size: 0.12, gravity: -12, life: 1.1, spread: 1.4 }));
        ctx.vfx.pillar(p, { radius: 1.2, height: 3, color: C("#2a9aff"), duration: 0.8, scroll: 16 });
        ctx.vfx.shake(0.25, 0.5);
        ctx.vfx.shockwave(p, 5, 0.6);
      });
    },
  },
  "Storm Net": {
    play(ctx, g) {
      const c = ctx.pos(g.caster)!;
      ctx.vfx.after(g.delay, () => {
        const pts = g.hits.map((u) => at(ctx, u)).filter((p): p is Vec3 => Boolean(p));
        for (const p of pts) ctx.vfx.lightning(up(c, 1), up(p, 0.9), { color: C("#7ab8ff"), duration: 0.6, width: 0.04, branches: 1 });
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i]!;
          const b = pts[(i + 1) % pts.length]!;
          if (pts.length > 1) ctx.vfx.lightning(up(a, 0.9), up(b, 0.9), { color: C("#9ad0ff"), duration: 0.6, width: 0.03, branches: 0 });
        }
        ctx.vfx.decal("runes", c, { radius: 2.4, color: C("#5a9aff"), duration: 1 });
      });
    },
  },
  "King of Uruk": {
    play(ctx, g) {
      ctx.vfx.after(g.delay, () => {
        const c = ctx.pos(g.caster);
        if (!c) return;
        ctx.vfx.during(0.3, (k) => {
          const a = k * Math.PI * 2;
          for (let i = 0; i < 4; i++) ctx.vfx.particle({ x: c.x + Math.cos(a) * 1.3, y: 0.8, z: c.z + Math.sin(a) * 1.3, life: 0.35, size: 0.22, color: C("#ffd24a"), intensity: 4 });
        });
        ctx.vfx.decal("ring", c, { radius: 2.4, color: C("#ffd24a"), duration: 0.5 });
        ctx.vfx.burst(up(c, 0.4), { count: 24, color: C("#ffcf3a"), speed: 3, up: 2, size: 0.1, gravity: -8, intensity: 2 });
        ctx.vfx.shake(0.15);
      });
    },
  },

  // -------------------------------------------------------------- monstres PvE
  Bite: { play: (ctx, g) => ctx.vfx.after(g.delay, () => { const p = at(ctx, g.center); if (p) slash(ctx, p, C("#ff6a5a"), 2, 0.5); }) },
  Shriek: { play: (ctx, g) => { const c = ctx.pos(g.caster)!; for (let i = 0; i < 3; i++) ctx.vfx.after(i * 0.1, () => ctx.vfx.decal("ring", c, { radius: 1.6 + i * 0.6, color: C("#c8a8ff"), duration: 0.5 })); } },
  Gore: { play: (ctx, g) => ctx.vfx.after(g.delay, () => { const p = at(ctx, g.center); if (p) impact(ctx, p, C("#c86a3a"), 1, { decal: "crack", shake: 0.15, dust: true }); }) },
  "Many Heads": { play: (ctx, g) => ctx.vfx.after(g.delay, () => { for (const u of g.hits) { const p = at(ctx, u); if (p) slash(ctx, p, C("#7aff5a"), 1, 0.5); } }) },
  "World Serpent": {
    impact: 600,
    play: (ctx, g) => ctx.vfx.after(g.delay, () => { const p = at(ctx, g.center); if (!p) return; ctx.vfx.decal("ripple", p, { radius: 3, color: C("#2a9a8a"), duration: 1.2 }); ctx.vfx.burst(p, { count: 40, color: C("#5ad0c0"), speed: 4, up: 3, gravity: -10, size: 0.12 }); ctx.vfx.shake(0.2); }),
  },
};

const DAMAGE_COLORS: Record<DamageType | string, string> = { physical: "#ffb36b", magic: "#b06aff", true: "#ffffff" };

/** Effet générique déduit des effets du sort (nouvelles unités sans recette dédiée). */
const generic: Recipe = {
  play(ctx, g) {
    const dmg = g.effects.find((e) => e.type === "damage") as Extract<BattleEvent, { type: "damage" }> | undefined;
    const color = dmg ? C(DAMAGE_COLORS[dmg.damageType] ?? "#ffffff") : g.color;
    const c = ctx.pos(g.caster);
    if (c) ctx.vfx.decal("runes", c, { radius: 1.6, color: g.color, duration: 0.9, spin: 1 });
    ctx.vfx.after(g.delay, () => {
      for (const u of g.hits) {
        const p = at(ctx, u);
        if (p) impact(ctx, p, color, g.hits.length > 1 ? 0.8 : 1.1);
      }
    });
  },
};

export function spellImpactMs(ability: string, _defId: string): number {
  return R[ability]?.impact ?? CAST_IMPACT * 1000;
}

/** Lance l'effet d'un sort ; `delay` = secondes jusqu'à l'impact. */
export function playSpell(ctx: SpellContext, group: CastGroup, delay: number): void {
  const defId = ctx.defId(group.caster);
  const hits = new Set<number>();
  const helped = new Set<number>();
  for (const e of group.effects) {
    const target = (e as { target?: number }).target;
    if (target === undefined) continue;
    if (e.type === "damage" || e.type === "stun") hits.add(target);
    else if (e.type === "heal" || e.type === "shield" || e.type === "buff") helped.add(target);
  }
  const info: CastInfo = { ...group, delay: Math.max(0.05, delay), color: new THREE.Color(unitColor(unitDef(defId))), hits: [...hits], helped: [...helped] };
  if (!ctx.pos(group.caster)) return;
  (R[group.ability] ?? generic).play(ctx, info);
}

/** Sorts qui ont une recette dédiée (pour les tests et le rapport). */
export const SPELL_NAMES = Object.keys(R);
