// Briques d'effets visuels : gerbes de particules, décalques au sol (anneaux, cercles de
// runes, fissures, ondes), éclairs, colonnes de lumière, bulles, projectiles avec traînée,
// lumières éclair, tremblement de caméra et flash d'écran. Les sorts (spells.ts) et les
// statuts (status.ts) se composent à partir de ces briques.
import * as THREE from "three/webgpu";
import {
  abs, atan, dot, float, fract, max, normalView, oneMinus, positionLocal, positionViewDirection, PI2, pow, screenUV, sin, smoothstep, step, time, uniform, uv, vec2, vec3, viewportSharedTexture,
  type Node,
} from "../tsl";
import type { QualitySettings } from "../quality";
import { ParticlePool, type ParticleSpawn } from "./particles";

export type Vec3 = { x: number; y: number; z: number };

export interface Effect {
  /** Retourne false quand l'effet est terminé. */
  update(now: number, dt: number): boolean;
  dispose(): void;
}

export type DecalKind = "ring" | "runes" | "disc" | "crack" | "ripple" | "star";

interface DecalUniforms {
  color: Node;
  progress: Node;
  opacity: Node;
  seed: Node;
}

const planeGeometry = new THREE.PlaneGeometry(2, 2);
planeGeometry.rotateX(-Math.PI / 2);

export const rand = (a = -1, b = 1) => a + Math.random() * (b - a);
export const color = (c: THREE.ColorRepresentation) => new THREE.Color(c);

export class VfxSystem {
  readonly root = new THREE.Group();
  readonly glow: ParticlePool;
  readonly smoke: ParticlePool;
  private readonly effects: Effect[] = [];
  private readonly decalPool = new Map<DecalKind, { mesh: THREE.Mesh; u: DecalUniforms; busy: boolean }[]>();
  // Réserves d'objets réutilisés : créer un matériau à chaque effet obligerait à recompiler
  // un shader (gel de l'image pendant les combats chargés).
  private readonly boltMats: { core: THREE.MeshBasicNodeMaterial; halo: THREE.MeshBasicNodeMaterial; busy: boolean }[] = [];
  private readonly pillars: { mesh: THREE.Mesh; progress: Node; tint: Node; scroll: Node; busy: boolean }[] = [];
  private readonly bubbles: { mesh: THREE.Mesh; opacity: Node; tint: Node; busy: boolean }[] = [];
  private readonly waves: { mesh: THREE.Mesh; progress: Node; busy: boolean }[] = [];
  private readonly lights: { light: THREE.PointLight; until: number; start: number; peak: number }[] = [];
  private shakeAmp = 0;
  private shakeUntil = 0;
  private shakeStart = 0;
  /** Flash d'écran (lu par le post-traitement). */
  readonly flashColor = uniform(new THREE.Color(0, 0, 0));
  private flashPeak = new THREE.Color(0, 0, 0);
  private flashStart = 0;
  private flashUntil = 0;
  private clock0 = performance.now();
  now = 0;

  constructor(private quality: QualitySettings) {
    this.glow = new ParticlePool(quality.particles, "additive");
    this.smoke = new ParticlePool(Math.max(1024, quality.particles / 4), "alpha");
    this.root.add(this.glow.sprite, this.smoke.sprite);
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight("#ffffff", 0, 9, 1.6);
      light.position.set(0, -50, 0);
      this.root.add(light);
      this.lights.push({ light, until: 0, start: 0, peak: 0 });
    }
  }

  /**
   * Fait apparaître une fois chaque type d'effet hors de l'écran au démarrage : leurs
   * shaders sont compilés pendant le chargement plutôt qu'au premier sort.
   */
  prewarm(): void {
    const far = { x: 0, y: -60, z: 0 };
    const c = new THREE.Color("#ffffff");
    for (const kind of ["ring", "runes", "disc", "crack", "ripple", "star"] as DecalKind[]) this.decal(kind, far, { radius: 0.1, color: c, duration: 0.2, y: -60 });
    for (let i = 0; i < 3; i++) {
      this.pillar(far, { radius: 0.1, height: 0.1, color: c, duration: 0.2 });
      this.lightning(far, { x: 0, y: -59, z: 0 }, { color: c, duration: 0.2, branches: 0 });
    }
    this.bubble(() => far, { radius: 0.1, color: c, duration: 0.2 });
    this.shockwave(far, 0.1, 0.2);
    this.burst(far, { count: 2, color: c });
    this.dust(far, { count: 2, color: c });
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
  }

  get settings(): QualitySettings {
    return this.quality;
  }

  update(): void {
    const t = (performance.now() - this.clock0) / 1000;
    const dt = Math.min(0.1, t - this.now);
    this.now = t;
    this.glow.setTime(t);
    this.smoke.setTime(t);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!;
      if (!e.update(t, dt)) {
        e.dispose();
        this.effects.splice(i, 1);
      }
    }
    for (const l of this.lights) {
      if (t >= l.until) l.light.intensity = 0;
      else {
        const k = (t - l.start) / (l.until - l.start);
        l.light.intensity = l.peak * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      }
    }
    if (t < this.flashUntil) {
      const k = 1 - (t - this.flashStart) / (this.flashUntil - this.flashStart);
      this.flashColor.value.copy(this.flashPeak).multiplyScalar(k * k);
    } else this.flashColor.value.setRGB(0, 0, 0);
    this.glow.flush();
    this.smoke.flush();
  }

  add(effect: Effect): void {
    this.effects.push(effect);
  }

  /** Exécute `fn` après `delay` secondes. */
  after(delay: number, fn: () => void): void {
    const at = this.now + delay;
    this.add({ update: (now) => (now >= at ? (fn(), false) : true), dispose: () => undefined });
  }

  /** Répète `fn(k)` pendant `duration` secondes (k de 0 à 1). */
  during(duration: number, fn: (k: number, dt: number) => void): void {
    const start = this.now;
    this.add({
      update: (now, dt) => {
        const k = Math.min(1, (now - start) / duration);
        fn(k, dt);
        return k < 1;
      },
      dispose: () => undefined,
    });
  }

  // ---------------------------------------------------------------- particules

  particle(p: ParticleSpawn, alpha = false): void {
    (alpha ? this.smoke : this.glow).spawn(p);
  }

  /** Gerbe sphérique de particules. */
  burst(at: Vec3, o: { count: number; color: THREE.Color; speed?: number; size?: number; life?: number; gravity?: number; intensity?: number; up?: number; spread?: number; alpha?: boolean; drag?: number; endSize?: number }): void {
    const n = Math.round(o.count * (this.quality.level === "low" ? 0.5 : 1));
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(rand(-1, 1));
      const sp = (o.speed ?? 3) * rand(0.4, 1);
      const spread = o.spread ?? 1;
      this.particle(
        {
          x: at.x, y: at.y, z: at.z,
          vx: Math.sin(ph) * Math.cos(th) * sp * spread,
          vy: Math.abs(Math.cos(ph)) * sp * 0.7 + (o.up ?? 0),
          vz: Math.sin(ph) * Math.sin(th) * sp * spread,
          life: (o.life ?? 0.7) * rand(0.6, 1.2),
          size: (o.size ?? 0.2) * rand(0.6, 1.3),
          endSize: o.endSize ?? 0.2,
          color: o.color,
          intensity: o.intensity ?? 2,
          gravity: o.gravity ?? -3,
          drag: o.drag ?? 2,
        },
        o.alpha,
      );
    }
  }

  /** Particules montantes (soins, auras). */
  rise(at: Vec3, o: { count: number; color: THREE.Color; radius?: number; speed?: number; size?: number; life?: number; intensity?: number; delay?: number }): void {
    for (let i = 0; i < o.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = (o.radius ?? 0.5) * Math.sqrt(Math.random());
      this.particle({
        x: at.x + Math.cos(a) * r, y: at.y + rand(0, 0.3), z: at.z + Math.sin(a) * r,
        vx: 0, vy: (o.speed ?? 1.5) * rand(0.6, 1.2), vz: 0,
        life: (o.life ?? 1) * rand(0.7, 1.2), size: (o.size ?? 0.14) * rand(0.6, 1.3), endSize: 0.3,
        color: o.color, intensity: o.intensity ?? 2.5, drag: 0.5, delay: (o.delay ?? 0) + rand(0, 0.25),
      });
    }
  }

  /** Fumée ou poussière (mélange normal). */
  dust(at: Vec3, o: { count: number; color: THREE.Color; radius?: number; size?: number; life?: number; speed?: number }): void {
    for (let i = 0; i < o.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 1.2) * rand(0.5, 1);
      this.particle(
        {
          x: at.x + Math.cos(a) * (o.radius ?? 0.3), y: at.y + 0.1, z: at.z + Math.sin(a) * (o.radius ?? 0.3),
          vx: Math.cos(a) * sp, vy: rand(0.3, 1), vz: Math.sin(a) * sp,
          life: (o.life ?? 1.1) * rand(0.7, 1.3), size: (o.size ?? 0.5) * rand(0.7, 1.3), endSize: 2.2,
          color: o.color, intensity: 1, drag: 2.5, gravity: 0.2,
        },
        true,
      );
    }
  }

  /** Traînée continue derrière un objet en mouvement (une particule par appel). */
  trail(at: Vec3, c: THREE.Color, size = 0.18, life = 0.35, intensity = 2.5): void {
    this.particle({ x: at.x + rand(-0.04, 0.04), y: at.y + rand(-0.04, 0.04), z: at.z + rand(-0.04, 0.04), life, size, endSize: 0.1, color: c, intensity, drag: 4 });
  }

  // ---------------------------------------------------------------- décalques au sol

  private createDecal(kind: DecalKind): { mesh: THREE.Mesh; u: DecalUniforms; busy: boolean } {
    const u: DecalUniforms = { color: uniform(new THREE.Color()), progress: uniform(0), opacity: uniform(1), seed: uniform(0) };
    const p = uv().sub(0.5).mul(2);
    const d = p.length();
    const ang = atan(p.y, p.x);
    const r = u.progress;
    let shape;
    switch (kind) {
      case "ring":
        shape = smoothstep(r.sub(0.18), r, d).mul(oneMinus(smoothstep(r, r.add(0.06), d)));
        break;
      case "disc":
        shape = pow(oneMinus(d.min(1)), 2);
        break;
      case "runes": {
        const band = (a: number, b: number) => smoothstep(a - 0.015, a, d).mul(oneMinus(smoothstep(b, b + 0.015, d)));
        const rot = time.mul(0.6).add(u.seed);
        const ticks = step(0.55, fract(ang.div(PI2).mul(24).add(rot.mul(2)))).mul(band(0.72, 0.84));
        const glyphs = step(0.7, fract(ang.div(PI2).mul(9).sub(rot))).mul(band(0.5, 0.58));
        // Triangle inscrit qui tourne : distance au bord d'un polygone à 3 côtés.
        const tri = abs(sin(ang.mul(1.5).add(rot.mul(0.5)))).mul(d);
        const star = oneMinus(smoothstep(0, 0.025, abs(tri.sub(0.42)))).mul(step(d, 0.62));
        shape = band(0.9, 0.96).add(band(0.62, 0.65)).add(ticks.mul(0.8)).add(glyphs).add(star.mul(0.7)).add(pow(oneMinus(d.min(1)), 3).mul(0.35));
        shape = shape.mul(step(d, 1));
        break;
      }
      case "crack": {
        const spikes = pow(abs(sin(ang.mul(5).add(u.seed))), 5).mul(0.6).add(pow(abs(sin(ang.mul(13).add(u.seed.mul(3)))), 9).mul(0.4));
        const reach = r.mul(float(0.25).add(spikes.mul(0.9)));
        shape = step(d, reach).mul(oneMinus(d)).mul(1.5).add(pow(oneMinus(d.min(1)), 4).mul(0.6));
        break;
      }
      case "ripple": {
        const waves = sin(d.sub(r).mul(28)).mul(0.5).add(0.5);
        shape = pow(waves, 3).mul(step(d, r)).mul(oneMinus(d.min(1)));
        break;
      }
      case "star": {
        const rays = pow(abs(sin(ang.mul(4).add(u.seed))), 30).add(pow(abs(sin(ang.mul(4).add(u.seed).add(0.785))), 60).mul(0.5));
        shape = rays.mul(oneMinus(d.min(1))).add(pow(oneMinus(d.min(1)), 6));
        break;
      }
    }
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    material.colorNode = vec3(u.color);
    material.opacityNode = max(shape, 0).mul(u.opacity);
    const mesh = new THREE.Mesh(planeGeometry, material);
    mesh.renderOrder = 5;
    mesh.visible = false;
    this.root.add(mesh);
    return { mesh, u, busy: false };
  }

  /**
   * Décalque au sol qui grandit puis s'efface. `progress` va de `from` à `to` (pour l'anneau,
   * c'est le rayon relatif) ; l'opacité suit une courbe d'apparition / disparition.
   */
  decal(kind: DecalKind, at: Vec3, o: { radius: number; color: THREE.Color; duration: number; intensity?: number; from?: number; to?: number; y?: number; spin?: number; hold?: number }): void {
    let pool = this.decalPool.get(kind);
    if (!pool) this.decalPool.set(kind, (pool = []));
    let d = pool.find((x) => !x.busy);
    if (!d) {
      d = this.createDecal(kind);
      pool.push(d);
    }
    const decal = d;
    decal.busy = true;
    decal.mesh.visible = true;
    decal.mesh.position.set(at.x, (o.y ?? 0.1) + pool.indexOf(decal) * 0.002, at.z);
    decal.mesh.scale.setScalar(o.radius);
    decal.mesh.rotation.y = Math.random() * Math.PI * 2;
    decal.u.color.value.copy(o.color).multiplyScalar(o.intensity ?? 2);
    decal.u.seed.value = Math.random() * 10;
    const from = o.from ?? 0.1;
    const to = o.to ?? 1;
    const hold = o.hold ?? 0;
    this.during(o.duration, (k, dt) => {
      const grow = Math.min(1, k / Math.max(0.01, 1 - hold));
      decal.u.progress.value = from + (to - from) * (1 - Math.pow(1 - grow, 3));
      decal.u.opacity.value = Math.min(1, k * 8) * (k < 1 - 0.35 ? 1 : (1 - k) / 0.35);
      if (o.spin) decal.mesh.rotation.y += o.spin * dt;
      if (k >= 1) {
        decal.busy = false;
        decal.mesh.visible = false;
      }
    });
  }

  // ---------------------------------------------------------------- éclairs et rayons

  /** Éclair zigzaguant de `a` à `b`, qui crépite pendant `duration` secondes. */
  lightning(a: Vec3, b: Vec3, o: { color: THREE.Color; duration?: number; width?: number; jag?: number; branches?: number }): void {
    const group = new THREE.Group();
    let mats = this.boltMats.find((m) => !m.busy);
    if (!mats) {
      mats = {
        core: new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
        halo: new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
        busy: false,
      };
      this.boltMats.push(mats);
    }
    const slot = mats;
    slot.busy = true;
    const { core, halo } = slot;
    core.color.copy(o.color).multiplyScalar(6);
    halo.color.copy(o.color).multiplyScalar(1.5);
    this.root.add(group);
    const width = o.width ?? 0.05;
    const build = () => {
      for (const c of [...group.children]) {
        (c as THREE.Mesh).geometry.dispose();
        group.remove(c);
      }
      const bolts: [Vec3, Vec3, number][] = [[a, b, 1]];
      for (let i = 0; i < (o.branches ?? 2); i++) {
        const k = rand(0.3, 0.7);
        const from = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
        bolts.push([from, { x: from.x + rand(-1.2, 1.2), y: from.y + rand(-1.4, 0), z: from.z + rand(-1.2, 1.2) }, 0.5]);
      }
      for (const [p, q, w] of bolts) {
        const pts = jaggedPath(p, q, 12, (o.jag ?? 0.35) * w);
        const path = new THREE.CurvePath<THREE.Vector3>();
        for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i]!, pts[i + 1]!));
        group.add(new THREE.Mesh(new THREE.TubeGeometry(path, pts.length * 2, width * w, 4, false), core));
        group.add(new THREE.Mesh(new THREE.TubeGeometry(path, pts.length * 2, width * w * 4, 5, false), halo));
      }
    };
    build();
    const duration = o.duration ?? 0.35;
    const start = this.now;
    let last = start;
    this.add({
      update: (now) => {
        if (now - last > 0.06) {
          last = now;
          build();
        }
        const k = (now - start) / duration;
        core.opacity = halo.opacity = Math.max(0, 1 - k) * (0.6 + Math.random() * 0.4);
        halo.opacity *= 0.35;
        return k < 1;
      },
      dispose: () => {
        for (const c of group.children) (c as THREE.Mesh).geometry.dispose();
        slot.busy = false;
        this.root.remove(group);
      },
    });
  }

  /** Colonne de lumière (rayon venu du ciel, pilier de soin…). */
  pillar(at: Vec3, o: { radius: number; height: number; color: THREE.Color; duration: number; intensity?: number; scroll?: number }): void {
    let p = this.pillars.find((x) => !x.busy);
    if (!p) {
      const progress = uniform(0);
      const tint = uniform(new THREE.Color());
      const scroll = uniform(8);
      const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const v = uv().y;
      const bands = sin(v.mul(18).sub(time.mul(scroll))).mul(0.25).add(0.75);
      material.colorNode = vec3(tint);
      material.opacityNode = pow(oneMinus(v), 1.3).mul(bands).mul(progress);
      const geometry = new THREE.CylinderGeometry(1, 1.15, 1, 24, 1, true);
      geometry.translate(0, 0.5, 0);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      this.root.add(mesh);
      p = { mesh, progress, tint, scroll, busy: false };
      this.pillars.push(p);
    }
    const slot = p;
    slot.busy = true;
    slot.mesh.visible = true;
    slot.mesh.position.set(at.x, 0, at.z);
    slot.tint.value.copy(o.color).multiplyScalar(o.intensity ?? 3);
    slot.scroll.value = o.scroll ?? 8;
    this.during(o.duration, (k) => {
      slot.progress.value = Math.min(1, k * 6) * (k < 0.6 ? 1 : (1 - k) / 0.4);
      const r = o.radius * (1 + k * 0.3);
      slot.mesh.scale.set(r, o.height, r);
      if (k >= 1) {
        slot.busy = false;
        slot.mesh.visible = false;
      }
    });
  }

  /** Bulle de bouclier à reflets (Fresnel) qui suit `follow`. */
  bubble(follow: () => Vec3 | null, o: { radius: number; color: THREE.Color; duration: number }): Effect {
    let b = this.bubbles.find((x) => !x.busy);
    if (!b) {
      const opacity = uniform(0);
      const tint = uniform(new THREE.Color());
      const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const fres = pow(oneMinus(abs(dot(normalView, positionViewDirection))), 2.2);
      const shimmer = sin(positionLocal.y.mul(14).add(time.mul(4))).mul(0.15).add(0.85);
      material.colorNode = vec3(tint);
      material.opacityNode = fres.mul(shimmer).add(0.04).mul(opacity);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), material);
      mesh.visible = false;
      this.root.add(mesh);
      b = { mesh, opacity, tint, busy: false };
      this.bubbles.push(b);
    }
    const slot = b;
    slot.busy = true;
    slot.mesh.visible = true;
    slot.tint.value.copy(o.color).multiplyScalar(2.2);
    const start = this.now;
    let done = false;
    this.add({
      update: (now) => {
        const p = follow();
        const k = (now - start) / o.duration;
        if (!p || k >= 1 || done) return false;
        slot.mesh.position.set(p.x, p.y, p.z);
        const pop = Math.min(1, (now - start) / 0.15);
        slot.mesh.scale.setScalar(o.radius * (0.6 + 0.4 * pop));
        slot.opacity.value = pop * (k > 0.85 ? (1 - k) / 0.15 : 1);
        return true;
      },
      dispose: () => {
        slot.busy = false;
        slot.mesh.visible = false;
      },
    });
    return { update: () => true, dispose: () => (done = true) };
  }

  /** Onde de choc qui déforme l'image (qualité haute uniquement). */
  shockwave(at: Vec3, radius: number, duration = 0.5): void {
    if (!this.quality.distortion) return;
    let w = this.waves.find((x) => !x.busy);
    if (!w) {
      const progress = uniform(0);
      const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
      const p = uv().sub(0.5).mul(2);
      const d = p.length();
      const band = smoothstep(progress.sub(0.25), progress, d).mul(oneMinus(smoothstep(progress, progress.add(0.08), d)));
      const offset = p.normalize().mul(band).mul(oneMinus(progress)).mul(0.03);
      material.colorNode = viewportSharedTexture(screenUV.sub(vec2(offset.x, offset.y.negate()))).rgb;
      material.opacityNode = band.mul(step(d, 1));
      const mesh = new THREE.Mesh(planeGeometry, material);
      mesh.renderOrder = 30;
      mesh.visible = false;
      this.root.add(mesh);
      w = { mesh, progress, busy: false };
      this.waves.push(w);
    }
    const slot = w;
    slot.busy = true;
    slot.mesh.visible = true;
    slot.mesh.position.set(at.x, 0.15, at.z);
    slot.mesh.scale.setScalar(radius);
    this.during(duration, (k) => {
      slot.progress.value = 0.1 + k * 0.95;
      if (k >= 1) {
        slot.busy = false;
        slot.mesh.visible = false;
      }
    });
  }

  // ---------------------------------------------------------------- projectiles

  /**
   * Projectile de `from` vers `to()` (la cible peut bouger) en `duration` secondes, avec une
   * courbe de hauteur `arc`. `mesh` optionnel (lance, flèche, rocher) orienté dans le sens du
   * déplacement ; `trail` est appelé à chaque image avec la position courante.
   */
  projectile(o: {
    from: Vec3;
    to: () => Vec3;
    duration: number;
    arc?: number;
    mesh?: THREE.Object3D;
    spin?: number;
    trail?: (p: Vec3, k: number) => void;
    onArrive?: (p: Vec3) => void;
  }): void {
    const start = this.now;
    const pos = new THREE.Vector3(o.from.x, o.from.y, o.from.z);
    const prev = pos.clone();
    if (o.mesh) {
      o.mesh.position.copy(pos);
      this.root.add(o.mesh);
    }
    this.add({
      update: (now) => {
        const k = Math.min(1, (now - start) / o.duration);
        const to = o.to();
        prev.copy(pos);
        pos.set(
          o.from.x + (to.x - o.from.x) * k,
          o.from.y + (to.y - o.from.y) * k + Math.sin(Math.PI * k) * (o.arc ?? 0),
          o.from.z + (to.z - o.from.z) * k,
        );
        if (o.mesh) {
          o.mesh.position.copy(pos);
          if (o.spin) o.mesh.rotation.x += o.spin * 0.016;
          else if (pos.distanceToSquared(prev) > 1e-6) o.mesh.lookAt(pos.clone().add(pos.clone().sub(prev)));
        }
        o.trail?.(pos, k);
        if (k >= 1) {
          o.onArrive?.(pos);
          return false;
        }
        return true;
      },
      dispose: () => {
        if (o.mesh) this.root.remove(o.mesh);
      },
    });
  }

  // ---------------------------------------------------------------- caméra, lumière, écran

  light(at: Vec3, c: THREE.Color, intensity = 30, duration = 0.35): void {
    if (!this.quality.flashLights) return;
    const slot = this.lights.reduce((a, b) => (a.until < b.until ? a : b));
    slot.light.color.copy(c);
    slot.light.position.set(at.x, at.y + 1, at.z);
    slot.start = this.now;
    slot.until = this.now + duration;
    slot.peak = intensity;
  }

  shake(amplitude: number, duration = 0.3): void {
    if (amplitude * Math.max(0, this.shakeUntil - this.now) > amplitude * duration && this.shakeAmp > amplitude) return;
    this.shakeAmp = amplitude;
    this.shakeStart = this.now;
    this.shakeUntil = this.now + duration;
  }

  /** Décalage de caméra du tremblement en cours. */
  shakeOffset(): Vec3 {
    if (this.now >= this.shakeUntil) return { x: 0, y: 0, z: 0 };
    const k = 1 - (this.now - this.shakeStart) / (this.shakeUntil - this.shakeStart);
    const a = this.shakeAmp * k * k;
    const t = this.now * 60;
    return { x: Math.sin(t * 1.3) * a, y: Math.sin(t * 1.7 + 1) * a * 0.6, z: Math.cos(t * 1.1) * a };
  }

  flash(c: THREE.ColorRepresentation, intensity = 0.4, duration = 0.25): void {
    this.flashPeak.set(c).multiplyScalar(intensity);
    this.flashStart = this.now;
    this.flashUntil = this.now + duration;
  }
}

function jaggedPath(a: Vec3, b: Vec3, segments: number, jag: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = dir.length();
  for (let i = 0; i <= segments; i++) {
    const k = i / segments;
    const off = i === 0 || i === segments ? 0 : jag * len * 0.12;
    pts.push(new THREE.Vector3(a.x + dir.x * k + rand(-off, off), a.y + dir.y * k + rand(-off, off), a.z + dir.z * k + rand(-off, off)));
  }
  return pts;
}

