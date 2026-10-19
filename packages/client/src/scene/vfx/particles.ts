// Particules calculées sur le GPU : à la naissance, le processeur écrit une seule fois la
// position, la vitesse, la couleur et la durée de vie de chaque particule dans un tampon
// circulaire ; le shader (TSL, donc WebGPU ou WebGL2) calcule ensuite la trajectoire
// (gravité, frottement), la taille et le fondu en fonction du temps. Aucune mise à jour
// image par image côté processeur.
import * as THREE from "three/webgpu";
import { clamp, exp, float, instancedBufferAttribute, max, mix, smoothstep, uniform, uv, vec3, vec4 } from "../tsl";

export interface ParticleSpawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Durée de vie en secondes. */
  life: number;
  size: number;
  /** Taille finale = size × endSize. */
  endSize?: number;
  color: THREE.Color;
  /** Multiplicateur de couleur (> 1 : brille avec le bloom). */
  intensity?: number;
  /** Accélération verticale (négative = chute). */
  gravity?: number;
  /** Frottement : la vitesse est divisée par e à chaque 1/drag seconde. */
  drag?: number;
  /** Naissance retardée, en secondes. */
  delay?: number;
}

export type ParticleBlend = "additive" | "alpha";

export class ParticlePool {
  readonly sprite: THREE.Sprite;
  private readonly capacity: number;
  private readonly a0: THREE.InstancedBufferAttribute; // x, y, z, naissance
  private readonly a1: THREE.InstancedBufferAttribute; // vx, vy, vz, durée de vie
  private readonly a2: THREE.InstancedBufferAttribute; // r, g, b, taille
  private readonly a3: THREE.InstancedBufferAttribute; // gravité, frottement, taille finale, douceur
  private readonly time = uniform(0);
  private cursor = 0;
  private dirtyFrom = Infinity;
  private dirtyTo = -1;
  private wrapped = false;
  private now = 0;
  private readonly blend: ParticleBlend;

  constructor(capacity: number, blend: ParticleBlend) {
    this.capacity = capacity;
    this.blend = blend;
    const make = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.a0 = make();
    this.a1 = make();
    this.a2 = make();
    this.a3 = make();
    // Particules « mortes » au départ : durée de vie nulle, naissance très ancienne.
    for (let i = 0; i < capacity; i++) {
      this.a0.array[i * 4 + 3] = -1e6;
      this.a1.array[i * 4 + 3] = 0.001;
    }

    const p0 = vec4(instancedBufferAttribute(this.a0));
    const p1 = vec4(instancedBufferAttribute(this.a1));
    const p2 = vec4(instancedBufferAttribute(this.a2));
    const p3 = vec4(instancedBufferAttribute(this.a3));

    const age = this.time.sub(p0.w);
    const life = p1.w;
    const k = clamp(age.div(life), 0, 1);
    const alive = age.greaterThanEqual(0).and(age.lessThan(life));
    const drag = max(p3.y, 0.0001);
    // Intégrale de v·e^(-drag·t) : déplacement freiné.
    const travel = float(1).sub(exp(drag.negate().mul(age))).div(drag);
    const pos = vec3(p0.x, p0.y, p0.z)
      .add(vec3(p1.x, p1.y, p1.z).mul(travel))
      .add(vec3(0, p3.x.mul(age).mul(age).mul(0.5), 0));

    const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
    material.blending = blend === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.positionNode = pos;
    material.scaleNode = alive.select(mix(p2.w, p2.w.mul(p3.z), k), float(0));
    // Disque doux : centre plein, bord estompé.
    const d = uv().sub(0.5).length().mul(2);
    const disc = float(1).sub(smoothstep(float(1).sub(p3.w), 1, d));
    const fade = smoothstep(0, 0.12, k).mul(float(1).sub(smoothstep(0.55, 1, k)));
    material.colorNode = vec3(p2.x, p2.y, p2.z);
    material.opacityNode = disc.mul(fade).mul(blend === "alpha" ? 0.85 : 1);

    this.sprite = new THREE.Sprite(material);
    this.sprite.count = capacity;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = blend === "additive" ? 20 : 10;
  }

  /** Temps courant des particules, en secondes. */
  setTime(seconds: number): void {
    this.now = seconds;
    this.time.value = seconds;
  }

  spawn(p: ParticleSpawn): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.cursor === 0) this.wrapped = true;
    const o = i * 4;
    const intensity = p.intensity ?? 1;
    const a0 = this.a0.array as Float32Array;
    const a1 = this.a1.array as Float32Array;
    const a2 = this.a2.array as Float32Array;
    const a3 = this.a3.array as Float32Array;
    a0[o] = p.x;
    a0[o + 1] = p.y;
    a0[o + 2] = p.z;
    a0[o + 3] = this.now + (p.delay ?? 0);
    a1[o] = p.vx ?? 0;
    a1[o + 1] = p.vy ?? 0;
    a1[o + 2] = p.vz ?? 0;
    a1[o + 3] = p.life;
    a2[o] = p.color.r * intensity;
    a2[o + 1] = p.color.g * intensity;
    a2[o + 2] = p.color.b * intensity;
    a2[o + 3] = p.size;
    a3[o] = p.gravity ?? 0;
    a3[o + 1] = p.drag ?? 0;
    a3[o + 2] = p.endSize ?? 1;
    a3[o + 3] = this.blend === "alpha" ? 0.9 : 0.6;
    this.dirtyFrom = Math.min(this.dirtyFrom, i);
    this.dirtyTo = Math.max(this.dirtyTo, i);
  }

  /** Envoie au GPU la plage modifiée depuis la dernière image. */
  flush(): void {
    if (this.dirtyTo < 0) return;
    // Après un tour complet du tampon, la plage peut couvrir tout : on envoie tout.
    const from = this.wrapped ? 0 : this.dirtyFrom;
    const count = this.wrapped ? this.capacity : this.dirtyTo - this.dirtyFrom + 1;
    for (const a of [this.a0, this.a1, this.a2, this.a3]) {
      a.clearUpdateRanges();
      a.addUpdateRange(from * 4, count * 4);
      a.needsUpdate = true;
    }
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
    this.wrapped = false;
  }
}
