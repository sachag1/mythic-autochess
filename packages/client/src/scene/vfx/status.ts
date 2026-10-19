// Effets visuels des statuts (étourdissement, et ceux que la simulation ajoutera : brûlure,
// anti-soin, poison…). Table facile à étendre : un nouveau type d'événement de combat qui
// porte `target` et `durationMs` devient un statut ; s'il a une entrée ici, il reçoit son
// effet, sinon un effet générique violet. Ajouter un statut = ajouter une ligne.
import * as THREE from "three/webgpu";
import type { StunStyle } from "../characters/Character";
import { rand, type Vec3, type VfxSystem } from "./VfxSystem";

export interface StatusStyle {
  /** Nom affiché au début du statut (texte flottant). */
  label: string;
  color: string;
  /** Particules émises tant que le statut dure. */
  particles: "stars" | "embers" | "drips" | "snow" | "sparks" | "smoke" | "spiral" | "none";
  /** Particules par seconde. */
  rate?: number;
}

export const STATUS_STYLES: Record<string, StatusStyle> = {
  stun: { label: "Étourdi", color: "#ffe14d", particles: "stars", rate: 14 },
  burn: { label: "Brûlure", color: "#ff6a1a", particles: "embers", rate: 18 },
  wound: { label: "Blessure grave", color: "#c0306a", particles: "drips", rate: 8 },
  antiheal: { label: "Anti-soin", color: "#c0306a", particles: "drips", rate: 8 },
  poison: { label: "Poison", color: "#8ad03a", particles: "drips", rate: 10 },
  chill: { label: "Gel", color: "#9fd8ff", particles: "snow", rate: 12 },
  freeze: { label: "Gelé", color: "#bfe8ff", particles: "snow", rate: 12 },
  silence: { label: "Silence", color: "#b0a0ff", particles: "spiral", rate: 10 },
  slow: { label: "Ralenti", color: "#6a8aff", particles: "smoke", rate: 6 },
  shred: { label: "Armure brisée", color: "#c8a070", particles: "sparks", rate: 6 },
  taunt: { label: "Provocation", color: "#ff4a4a", particles: "spiral", rate: 8 },
};

const FALLBACK: StatusStyle = { label: "", color: "#b06aff", particles: "spiral", rate: 8 };

export function statusStyle(type: string): StatusStyle {
  return STATUS_STYLES[type] ?? FALLBACK;
}

/** Style d'étourdissement selon l'unité qui l'inflige (Méduse pétrifie, Yuki-onna gèle…). */
export const STUN_STYLE_BY_SOURCE: Record<string, StunStyle> = {
  medusa: "stone",
  yukionna: "ice",
  marduk: "net",
  kappa: "water",
  sobek: "water",
};

/** Émet les particules d'un statut actif autour d'une unité. `acc` : accumulateur par unité. */
export function emitStatus(vfx: VfxSystem, type: string, at: Vec3, height: number, dt: number, acc: { v: number }): void {
  const s = statusStyle(type);
  if (s.particles === "none") return;
  acc.v += dt * (s.rate ?? 8) * (vfx.settings.level === "low" ? 0.4 : 1);
  const c = new THREE.Color(s.color);
  while (acc.v > 1) {
    acc.v -= 1;
    const a = Math.random() * Math.PI * 2;
    switch (s.particles) {
      case "stars": {
        // Étoiles qui tournent au-dessus de la tête.
        const t = vfx.now * 5 + Math.random();
        vfx.particle({ x: at.x + Math.cos(t) * 0.35, y: height + 0.25, z: at.z + Math.sin(t) * 0.35, vx: -Math.sin(t) * 1.2, vz: Math.cos(t) * 1.2, life: 0.35, size: 0.12, color: c, intensity: 4, drag: 2 });
        break;
      }
      case "embers":
        vfx.particle({ x: at.x + Math.cos(a) * 0.3, y: rand(0.2, height), z: at.z + Math.sin(a) * 0.3, vy: rand(0.8, 1.6), life: 0.6, size: 0.18, endSize: 0.1, color: c, intensity: 3, drag: 1 });
        break;
      case "drips":
        vfx.particle({ x: at.x + Math.cos(a) * 0.3, y: rand(height * 0.4, height), z: at.z + Math.sin(a) * 0.3, vy: -0.5, gravity: -6, life: 0.6, size: 0.07, color: c, intensity: 2 });
        break;
      case "snow":
        vfx.particle({ x: at.x + Math.cos(a) * 0.5, y: rand(0.3, height + 0.3), z: at.z + Math.sin(a) * 0.5, vy: -0.3, life: 1, size: 0.06, color: c, intensity: 2 });
        break;
      case "sparks":
        vfx.particle({ x: at.x, y: rand(0.3, height), z: at.z, vx: Math.cos(a) * 1.5, vy: rand(0, 1), vz: Math.sin(a) * 1.5, life: 0.3, size: 0.05, color: c, intensity: 4, gravity: -4 });
        break;
      case "smoke":
        vfx.particle({ x: at.x + Math.cos(a) * 0.3, y: 0.1, z: at.z + Math.sin(a) * 0.3, vy: 0.4, life: 1, size: 0.3, endSize: 2.5, color: c }, true);
        break;
      case "spiral": {
        const t = vfx.now * 4;
        vfx.particle({ x: at.x + Math.cos(t + a) * 0.45, y: rand(0.2, height), z: at.z + Math.sin(t + a) * 0.45, vy: 0.6, life: 0.5, size: 0.08, color: c, intensity: 3 });
        break;
      }
    }
  }
}
