// Un personnage animé sur le plateau : modèle (corps KayKit ou créature Quaternius) cloné,
// recoloré et habillé d'accessoires, avec des matériaux à effets (reflet du panthéon, flash
// quand il est touché, pierre ou glace, dissolution à la mort) et une machine d'animations
// à fondus (AnimationMixer) pilotée par le replay du combat.
import * as THREE from "three/webgpu";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { originOf, PANTHEON_COLORS, unitDef, itemStyle } from "../../data/content";
import { assets, namedNode } from "../assets";
import { abs, dot, mix, mx_noise_float, normalView, oneMinus, positionLocal, positionViewDirection, pow, smoothstep, step, texture, uniform, uv, vec3, type Node } from "../tsl";
import type { VfxSystem } from "../vfx/VfxSystem";
import { boneFor, buildAccessory } from "./accessories";
import { isHumanoid, specFor, type AttackStyle, type AuraKind, type BodyId, type CharSpec } from "./catalog";
import { recolorAtlas } from "./recolor";
import { realProp } from "./realProps";
import { MIXAMO_ATTACKS, MIXAMO_CHARACTERS, MIXAMO_LOGICAL, mixamoAvailable, type MixamoSpec } from "./mixamo";

export type Team = "ally" | "enemy";
export type StunStyle = "stars" | "stone" | "ice" | "net" | "water";

/** Taille du modèle d'origine → taille sur le plateau (1 case = 1 unité de rayon). */
const BODY_SCALE: Record<BodyId, number> = {
  knight: 0.6, barbarian: 0.6, mage: 0.6, rogue: 0.6, rogue_hooded: 0.6,
  skeleton_mage: 0.6, skeleton_minion: 0.6, skeleton_rogue: 0.6, skeleton_warrior: 0.6,
  wolf: 0.36, fox: 0.34, husky: 0.36, bull: 0.2, stag: 0.27, snake: 0.5, snake_angry: 0.5, spider: 0.38, trex: 0.055,
};

const BODY_FILE = (b: BodyId) => (isHumanoid(b) ? `chars/${b}.glb` : `creatures/${b}.glb`);

/** Moment de l'impact après le début de l'animation d'attaque (s) — voir timeline.ts. */
export const ATTACK_IMPACT = 0.28;
export const CAST_IMPACT = 0.38;

const ATTACK_CLIPS: Record<AttackStyle, string[]> = {
  melee1h: ["1H_Melee_Attack_Chop", "1H_Melee_Attack_Slice_Diagonal", "1H_Melee_Attack_Slice_Horizontal", "1H_Melee_Attack_Stab"],
  melee2h: ["2H_Melee_Attack_Chop", "2H_Melee_Attack_Slice", "2H_Melee_Attack_Stab"],
  dual: ["Dualwield_Melee_Attack_Chop", "Dualwield_Melee_Attack_Slice", "Dualwield_Melee_Attack_Stab"],
  unarmed: ["Unarmed_Melee_Attack_Punch_A", "Unarmed_Melee_Attack_Punch_B", "Unarmed_Melee_Attack_Kick"],
  bow: ["1H_Ranged_Shoot"],
  crossbow: ["2H_Ranged_Shoot"],
  magic: ["Spellcast_Shoot"],
  thrown: ["Throw"],
  bite: ["Attack", "Attack_Headbutt", "Snake_Attack", "Spider_Attack", "TRex_Attack"],
};
const LOGICAL: Record<string, string[]> = {
  idle: ["Idle", "Snake_Idle", "Spider_Idle", "TRex_Idle"],
  combatIdle: ["Idle_Combat", "Idle", "Snake_Idle", "Spider_Idle", "TRex_Idle"],
  run: ["Running_A", "Gallop", "Snake_Walk", "Spider_Walk", "TRex_Run"],
  hit: ["Hit_A", "Hit_B", "Idle_HitReact_Left"],
  stun: ["Hit_B", "Idle_HitReact_Left", "Snake_Idle", "Spider_Idle", "TRex_Idle"],
  death: ["Death_A", "Death_B", "Death", "Spider_Death", "TRex_Death"],
  jump: ["Jump_Full_Long", "Gallop_Jump", "Snake_Jump", "Spider_Jump", "TRex_Jump"],
  victory: ["Cheer", "Gallop_Jump", "Snake_Jump", "Spider_Jump", "TRex_Jump"],
  dance: ["Taunt_Longer", "Cheer", "Jump_Full_Short", "Gallop_Jump", "Snake_Attack", "TRex_Jump"],
  spawn: ["Spawn_Ground"],
};

const AURA_COLORS: Record<AuraKind, string> = {
  embers: "#ff7a2a", wisps: "#7fd0ff", snow: "#e8f4ff", sparks: "#ffd76a", leaves: "#7ad05a", smoke: "#6a6a7a", water: "#4ab0ff",
  sand: "#e8c47a", stars: "#fff0b0", petals: "#ff9ac8", shadow: "#8a5aff", lightning: "#9ad0ff",
};

/** État des effets d'un personnage, lu par les matériaux partagés au moment du rendu de chaque objet. */
interface FxState {
  flash: number;
  stone: number;
  stoneColor: THREE.Color;
  dissolve: number;
  rim: THREE.Color;
  rimStrength: number;
}

export class Character {
  readonly root = new THREE.Group();
  /** Partie animée en hauteur (sauts) et en élan (attaques). */
  readonly figure = new THREE.Group();
  readonly spec: CharSpec;
  readonly defId: string;
  readonly star: number;
  height: number;
  loaded = false;
  readonly ready: Promise<void>;

  private team: Team;
  private readonly base: THREE.Mesh;
  private readonly pantheonDisc: THREE.Mesh;
  private readonly starRing: THREE.Mesh | null = null;
  private readonly gems = new THREE.Group();
  private readonly mixers: THREE.AnimationMixer[] = [];
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private current: THREE.AnimationAction[] = [];
  private currentName = "";
  private oneShotUntil = 0;
  private baseState: "idle" | "combatIdle" | "run" | "stun" | "dead" | "victory" = "idle";
  private frozen = false;
  private readonly fx: FxState;
  private readonly animated: THREE.Object3D[] = [];
  private flashUntil = 0;
  private stoneTarget = 0;
  private yaw = 0;
  private yawTarget = 0;
  private time = 0;
  private auraClock = 0;
  private deathAt = -1;
  private readonly scaleFactor: number;
  private readonly pantheonColor: THREE.Color;
  private disposed = false;
  /** Maillages du personnage (pour passer aux matériaux de dissolution à la mort). */
  private readonly meshes: THREE.Mesh[] = [];
  /** Apparence Mixamo si le modèle réaliste est utilisé. */
  private mixamo: MixamoSpec | null = null;

  constructor(defId: string, star: number, team: Team, private readonly vfx: VfxSystem | null = null) {
    this.defId = defId;
    this.star = star;
    this.team = team;
    this.spec = specFor(defId);
    const def = unitDef(defId);
    const cost = def?.cost ?? 1;
    this.scaleFactor = 1.2 * BODY_SCALE[this.spec.body] * (this.spec.scale ?? 1) * (0.92 + 0.05 * cost) * (star === 3 ? 1.22 : star === 2 ? 1.1 : 1);
    this.height = 1.8 * (this.spec.scale ?? 1) * (0.92 + 0.05 * cost) * (star === 3 ? 1.22 : star === 2 ? 1.1 : 1);
    this.pantheonColor = new THREE.Color(PANTHEON_COLORS[originOf(def) ?? ""] ?? "#9a9aa8");
    this.fx = {
      flash: 0,
      stone: 0,
      stoneColor: new THREE.Color("#8d8a84"),
      dissolve: 0,
      rim: this.pantheonColor.clone(),
      rimStrength: star === 3 ? 1.6 : star === 2 ? 1.0 : 0.55,
    };
    if (star === 3) this.fx.rim.lerp(new THREE.Color("#ffd24a"), 0.6);
    else if (star === 2) this.fx.rim.lerp(new THREE.Color("#dfe8ff"), 0.4);

    this.root.add(this.figure);
    this.base = new THREE.Mesh(BASE_RING, baseMaterial(team));
    this.base.rotation.x = -Math.PI / 2;
    this.base.position.y = 0.06;
    this.root.add(this.base);
    this.pantheonDisc = new THREE.Mesh(DISC, glowMaterial(`#${this.pantheonColor.getHexString()}`, 0.35));
    this.pantheonDisc.rotation.x = -Math.PI / 2;
    this.pantheonDisc.position.y = 0.05;
    this.pantheonDisc.scale.setScalar(0.85);
    this.root.add(this.pantheonDisc);
    if (star >= 2) {
      this.starRing = new THREE.Mesh(STAR_RING, glowMaterial(star === 3 ? "#ffd24a" : "#dfe8ff", star === 3 ? 2.2 : 1.2));
      this.starRing.rotation.x = -Math.PI / 2;
      this.starRing.position.y = 0.07;
      this.root.add(this.starRing);
    }
    this.gems.position.y = 0.25;
    this.root.add(this.gems);
    this.ready = this.load().catch((e) => console.error(`[autochess] ${defId}:`, e));
  }

  // ---------------------------------------------------------------- chargement

  private async load(): Promise<void> {
    const mx = MIXAMO_CHARACTERS[this.defId];
    if (mx && (await mixamoAvailable())) return this.loadMixamo(mx);
    const spec = this.spec;
    const [body, anims, props] = await Promise.all([
      assets.load(BODY_FILE(spec.body)),
      isHumanoid(spec.body) ? assets.load("anims/humanoid.glb") : Promise.resolve(null),
      assets.load("props.glb"),
    ]);
    if (this.disposed) return;
    for (const clip of anims?.animations ?? body.animations) this.clips.set(clip.name.replace(/^.*\|/, ""), clip);

    const heads = spec.heads ?? 1;
    const holder = new THREE.Group();
    holder.scale.setScalar(this.scaleFactor);
    this.figure.add(holder);
    for (let h = 0; h < heads; h++) {
      const model = SkeletonUtils.clone(body.scene);
      if (heads > 1) {
        // Hydre : têtes en éventail, celle du milieu plus grande.
        const t = heads === 1 ? 0 : -1 + (2 * h) / (heads - 1);
        model.position.set(t * 1.3, 0, -Math.abs(t) * 0.8);
        model.rotation.y = -t * 0.45;
        model.scale.setScalar(0.62 + 0.3 * (1 - Math.abs(t)));
      }
      if (!isHumanoid(spec.body)) smoothCreature(model);
      this.dress(model, props.scene);
      holder.add(model);
      const mixer = new THREE.AnimationMixer(model);
      if (heads > 1) mixer.setTime(h * 0.37);
      this.mixers.push(mixer);
    }
    this.loaded = true;
    this.play(this.baseState === "dead" ? "death" : this.baseState, { fade: 0 });
    if (this.baseState === "dead") this.mixers.forEach((m) => m.update(5));
  }

  // ---------------------------------------------------------------- modèles Mixamo (réalistes)

  /** Corps Mixamo : taille normalisée, os renommés, animations recalées, accessoires. */
  private async loadMixamo(mx: MixamoSpec): Promise<void> {
    const [body, anims, props, mxWeapons, phWeapons] = await Promise.all([
      assets.load(`mixamo/${mx.body}.glb`),
      assets.load("mixamo/animations.glb"),
      assets.load("props.glb"),
      assets.load("mixamo/weapons.glb").catch(() => undefined),
      assets.load("weapons.glb").catch(() => undefined),
    ]);
    if (this.disposed) return;
    this.mixamo = mx;
    const model = SkeletonUtils.clone(body.scene);
    // Préfixes d'os variables selon les personnages (« mixamorig1: »…) : on les unifie.
    model.traverse((o) => {
      o.name = o.name.replace(/^mixamorig\d*:?/, "mixamorig");
    });
    model.updateMatrixWorld(true);
    const top = model.getObjectByName("mixamorigHeadTop_End");
    let height = top ? top.getWorldPosition(new THREE.Vector3()).y * 1.04 : 0;
    if (!(height > 0)) height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
    for (const clip of mixamoClips(mx.body, model, anims)) this.clips.set(clip.name, clip);

    const def = unitDef(this.defId);
    const target = 1.95 * (mx.scale ?? 1) * (0.94 + 0.04 * (def?.cost ?? 1)) * (this.star === 3 ? 1.2 : this.star === 2 ? 1.1 : 1);
    this.height = target;
    const holder = new THREE.Group();
    holder.scale.setScalar(target / height);
    this.figure.add(holder);

    const tint = mx.tint ? new THREE.Color("#ffffff").lerp(new THREE.Color(mx.tint), mx.tintAmount ?? 0.3) : null;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      if (mx.hide?.includes(m.name)) m.visible = false;
      this.setMaterial(m, { tint: tint ? `#${tint.getHexString()}` : undefined, realistic: true });
    });
    // Accessoires et objets : cotes pensées pour la tête KayKit (1,07 unité), ramenées à
    // la taille réelle du modèle, en compensant l'échelle propre de chaque os.
    const unit = height / 1.8;
    /** Rattache à un os : `factor` met à l'échelle l'objet, `offset` (mètres) le décale. */
    const attach = (boneName: string, obj: THREE.Object3D, factor: number, offset?: THREE.Vector3) => {
      const bone = boneName === "root" ? model : model.getObjectByName(boneName);
      if (!bone) return;
      const ws = bone.getWorldScale(new THREE.Vector3()).x || 1;
      obj.scale.multiplyScalar((factor * unit) / ws);
      if (offset) obj.position.copy(offset).multiplyScalar(unit / ws);
      bone.add(obj);
    };
    for (const p of mx.props ?? []) {
      // Arme réaliste si elle existe (épée, bouclier, arc Mixamo ; armes Poly Haven ; lance…).
      const real = realProp(p.id, p.hand, mxWeapons, phWeapons);
      if (real) {
        real.object.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          this.setMaterial(m, { tint: p.tint, glow: p.glow, realistic: true, keepMetal: true });
        });
        attach(real.bone, real.object, 1);
        continue;
      }
      const src = namedNode(props, p.id);
      if (!src) continue;
      const prop = src.clone(true);
      prop.scale.setScalar(p.scale ?? 1);
      prop.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        this.setMaterial(m, { tint: p.tint, glow: p.glow });
      });
      // Main Mixamo : axe y vers les doigts ; l'arme traverse le poing perpendiculairement.
      const grip = new THREE.Group();
      grip.name = `grip_${p.hand}`;
      grip.add(prop);
      grip.rotation.set(...MIXAMO_GRIP_ROT[p.hand]);
      attach(p.hand === "r" ? "mixamorigRightHand" : "mixamorigLeftHand", grip, 0.75, new THREE.Vector3(...MIXAMO_GRIP_POS[p.hand]));
    }
    for (const a of mx.acc ?? []) {
      const kind = boneFor(a);
      const boneName = kind === "head" ? "mixamorigHead" : kind === "chest" ? "mixamorigSpine2" : kind === "hips" ? "mixamorigHips" : kind === "handslot.l" ? "mixamorigLeftHand" : kind === "handslot.r" ? "mixamorigRightHand" : "root";
      const acc = buildAccessory(a);
      acc.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) this.setAccessoryMaterial(m);
        if (o.userData.flap !== undefined || o.userData.sway || o.userData.spin) this.animated.push(o);
      });
      // Tête réelle ≈ 0,2 m pour 1,07 unité KayKit ; buste ≈ 0,45.
      const factor = kind === "head" ? 0.21 : kind === "root" ? 0.55 : kind.startsWith("handslot") ? 0.5 : 0.45;
      const wrap = new THREE.Group();
      wrap.add(acc);
      attach(boneName, wrap, factor, kind === "head" ? new THREE.Vector3(0, -0.02, 0.01) : undefined);
    }
    holder.add(model);
    this.mixers.push(new THREE.AnimationMixer(model));
    this.loaded = true;
    this.play(this.baseState === "dead" ? "death" : this.baseState, { fade: 0 });
    if (this.baseState === "dead") this.mixers.forEach((m) => m.update(5));
  }

  /** Recolore, masque les objets non utilisés, ajoute armes et accessoires. */
  private dress(model: THREE.Object3D, props: THREE.Object3D): void {
    const spec = this.spec;
    const bones = new Map<string, THREE.Object3D>();
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone || o.type === "Object3D" || o.type === "Group") bones.set(o.name, o);
    });
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      if (isHumanoid(spec.body)) {
        const isProp = /Sword|Shield|Axe|Mug|Spellbook|Wand|Staff|Crossbow|Knife|Throwable/.test(m.name);
        if (isProp) m.visible = spec.show?.includes(m.name) ?? false;
        if (spec.hide?.includes(m.name)) m.visible = false;
      }
      this.setMaterial(m, { recolor: isHumanoid(spec.body) });
    });

    for (const p of spec.props ?? []) {
      const src = namedNode({ scene: props } as never, p.id);
      const bone = bones.get(p.hand === "r" ? "handslotr" : "handslotl");
      if (!src || !bone) continue;
      const prop = src.clone(true);
      prop.position.set(...(p.pos ?? [0, 0, 0]));
      if (p.rot) prop.rotation.set(...p.rot);
      prop.scale.setScalar(p.scale ?? 1);
      prop.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        this.setMaterial(m, { tint: p.tint, glow: p.glow });
      });
      bone.add(prop);
    }

    for (const a of spec.acc ?? []) {
      // GLTFLoader retire les points des noms d'os (« handslot.r » → « handslotr »).
      const boneName = boneFor(a).replace(/[.:/[\]]/g, "");
      const bone = bones.get(boneName) ?? (boneName === "root" ? model : undefined);
      if (!bone) continue;
      const acc = buildAccessory(a);
      acc.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) this.setAccessoryMaterial(m);
        if (o.userData.flap !== undefined || o.userData.sway || o.userData.spin) this.animated.push(o);
      });
      bone.add(acc);
    }
  }

  /**
   * Accessoires : leur couleur passe en teinte par objet et le matériau source est ramené à
   * une version blanche par famille (métal, rugosité, lueur) : très peu de shaders différents.
   */
  private setAccessoryMaterial(m: THREE.Mesh): void {
    const src = m.material as THREE.MeshStandardMaterial;
    const key = `${src.metalness}|${src.roughness}|${src.transparent ? src.opacity : 1}|${src.side}|${src.emissiveIntensity > 0 ? 1 : 0}|${src.map?.uuid}|${src.normalMap?.uuid}|${src.alphaTest}`;
    let canonical = canonicalAccessory.get(key);
    if (!canonical) {
      canonical = src.clone();
      canonical.color.set("#ffffff");
      canonical.emissive.set("#000000");
      canonical.emissiveIntensity = 0;
      canonicalAccessory.set(key, canonical);
    }
    const glow = src.emissiveIntensity > 0 ? `#${src.color.clone().multiplyScalar(src.emissiveIntensity / 1.2).getHexString()}` : undefined;
    m.material = canonical;
    // « realistic » garde le relief et la rugosité des matières (métal, cuir, velours…).
    this.setMaterial(m, { tint: `#${src.color.getHexString()}`, glow, realistic: true, keepMetal: true });
    // Une lueur > 1 dépasse ce qu'une couleur hexadécimale peut porter : on la garde telle quelle.
    if (src.emissiveIntensity > 1) m.userData.glow = src.color.clone().multiplyScalar(src.emissiveIntensity);
  }

  /** Remplace le matériau d'un maillage par sa version à effets (partagée entre personnages). */
  private setMaterial(m: THREE.Mesh, o: MaterialOptions): void {
    const spec = this.spec;
    const opts: MaterialOptions = { ...o, palette: o.recolor ? spec.palette : undefined, body: spec.body, matColors: spec.matColors, eyes: spec.eyes, ghost: spec.ghost };
    const src = m.material as THREE.Material | THREE.Material[];
    m.userData.fx = this.fx;
    // Teinte et lueur propres à l'objet (uniformes par objet) : le matériau reste partagé.
    m.userData.tint = o.tint ? new THREE.Color(o.tint) : WHITE;
    m.userData.glow = o.glow ? new THREE.Color(o.glow).multiplyScalar(1.2) : BLACK;
    m.userData.fxSource = { src, opts };
    m.material = Array.isArray(src) ? src.map((x) => effectMaterial(x, opts)) : effectMaterial(src, opts);
    this.meshes.push(m);
  }

  // ---------------------------------------------------------------- animations

  private findClip(names: string[]): THREE.AnimationClip | undefined {
    for (const n of names) {
      const c = this.clips.get(n);
      if (c) return c;
    }
    return undefined;
  }

  private clipNames(logical: string): string[] {
    const mx = this.mixamo;
    if (mx) {
      const attack = mx.attack ?? this.spec.attack;
      if (logical === "attack") return MIXAMO_ATTACKS[attack];
      if (logical === "cast") return [mx.cast ?? "cast", ...MIXAMO_ATTACKS[attack]];
      if (mx.brute && logical === "combatIdle") return ["brute_idle", "combat_idle"];
      if (mx.brute && logical === "run") return ["brute_run", "run"];
      if (logical === "combatIdle" && (attack === "magic" || attack === "bow" || attack === "crossbow")) return ["idle"];
      return MIXAMO_LOGICAL[logical] ?? [logical];
    }
    if (logical === "attack") return ATTACK_CLIPS[this.spec.attack];
    if (logical === "cast") return [this.spec.cast ?? "", "Spellcast_Shoot", ...ATTACK_CLIPS[this.spec.attack]];
    if (logical === "combatIdle" && this.spec.attack === "melee2h") return ["2H_Melee_Idle", ...LOGICAL.combatIdle!];
    return LOGICAL[logical] ?? [logical];
  }

  /**
   * Lance une animation. `duration` : durée voulue (accélère le clip) ; `once` : joue une fois
   * puis revient à l'état de base.
   */
  private play(logical: string, o: { fade?: number; once?: boolean; duration?: number; impact?: number; random?: boolean; clamp?: boolean } = {}): void {
    if (!this.loaded) return;
    const names = this.clipNames(logical);
    const pick = o.random ? [names[Math.floor(Math.random() * names.length)]!, ...names] : names;
    const clip = this.findClip(pick);
    if (!clip) return;
    const fade = o.fade ?? 0.18;
    const next: THREE.AnimationAction[] = [];
    let timeScale = 1;
    if (o.impact !== undefined) timeScale = Math.max(0.6, Math.min(3, (clip.duration * 0.42) / o.impact));
    else if (o.duration) timeScale = clip.duration / o.duration;
    for (const mixer of this.mixers) {
      const action = mixer.clipAction(clip);
      action.reset();
      action.enabled = true;
      action.setEffectiveTimeScale(timeScale);
      action.setEffectiveWeight(1);
      action.setLoop(o.once || o.clamp ? THREE.LoopOnce : THREE.LoopRepeat, o.once || o.clamp ? 1 : Infinity);
      action.clampWhenFinished = Boolean(o.clamp || o.once);
      action.play();
      next.push(action);
    }
    for (const a of this.current) if (!next.includes(a)) a.fadeOut(fade);
    for (const a of next) if (fade > 0 && this.current.length) a.fadeIn(fade);
    this.current = next;
    this.currentName = clip.name;
    this.oneShotUntil = o.once ? this.time + clip.duration / timeScale - fade : 0;
  }

  private returnToBase(): void {
    if (this.baseState === "dead") return;
    this.play(this.baseState, { clamp: this.baseState === "stun" && !this.mixamo });
  }

  setInCombat(combat: boolean): void {
    if (this.baseState === "idle" || this.baseState === "combatIdle") {
      const next = combat ? "combatIdle" : "idle";
      if (next !== this.baseState) {
        this.baseState = next;
        if (!this.oneShotUntil) this.returnToBase();
      }
    }
  }

  setMoving(moving: boolean): void {
    if (this.baseState === "dead" || this.baseState === "stun") return;
    const next = moving ? "run" : "combatIdle";
    if (next === this.baseState) return;
    this.baseState = next;
    if (!this.oneShotUntil || moving) {
      this.oneShotUntil = 0;
      this.returnToBase();
    }
  }

  attack(): void {
    if (this.baseState === "dead" || this.baseState === "stun") return;
    this.play("attack", { once: true, impact: ATTACK_IMPACT, random: true, fade: 0.08 });
  }

  cast(): void {
    if (this.baseState === "dead" || this.baseState === "stun") return;
    this.play("cast", { once: true, impact: CAST_IMPACT, fade: 0.08 });
  }

  hit(): void {
    this.flashUntil = this.time + 0.12;
    if (this.oneShotUntil || this.baseState === "dead" || this.baseState === "stun" || this.baseState === "run") return;
    this.play("hit", { once: true, duration: 0.45, fade: 0.06 });
  }

  /** Saut (assassins) : animation accélérée à la durée du déplacement. */
  leap(duration: number): void {
    this.play("jump", { once: true, duration: duration * 1.25, fade: 0.05 });
  }

  stun(on: boolean, style: StunStyle = "stars"): void {
    if (this.baseState === "dead") return;
    if (on) {
      this.baseState = "stun";
      this.oneShotUntil = 0;
      if (style === "stone" || style === "ice") {
        this.frozen = true;
        this.stoneTarget = 1;
        this.fx.stoneColor.set(style === "ice" ? "#9fd8ff" : "#8d8a84");
      } else if (this.mixamo) this.play("stun", { fade: 0.15 });
      else this.play("stun", { clamp: true, duration: 0.5 });
    } else {
      this.frozen = false;
      this.stoneTarget = 0;
      this.baseState = "combatIdle";
      this.returnToBase();
    }
  }

  die(): void {
    if (this.baseState === "dead") return;
    this.frozen = false;
    this.stoneTarget = 0;
    this.baseState = "dead";
    this.oneShotUntil = 0;
    this.deathAt = this.time;
    this.enableDissolve();
    this.play("death", { clamp: true, fade: 0.1, duration: 0.9 });
    this.base.visible = false;
    this.starRing && (this.starRing.visible = false);
  }

  /** Passe aux matériaux de dissolution (bruit par pixel coûteux : seulement à la mort). */
  enableDissolve(): void {
    for (const m of this.meshes) {
      const { src, opts } = m.userData.fxSource as { src: THREE.Material | THREE.Material[]; opts: MaterialOptions };
      const o = { ...opts, dissolve: true };
      m.material = Array.isArray(src) ? src.map((x) => effectMaterial(x, o)) : effectMaterial(src, o);
    }
  }

  victory(dance: boolean): void {
    if (this.baseState === "dead") return;
    this.baseState = "victory";
    this.play(dance ? "dance" : "victory", { fade: 0.25 });
  }

  /** Entrée en scène (début de combat ou achat). */
  spawn(): void {
    if (this.clips.has("Spawn_Ground") && this.spec.body.startsWith("skeleton")) this.play("spawn", { once: true, duration: 0.9, fade: 0 });
    this.figure.scale.setScalar(0.01);
    this.spawnAt = this.time;
  }
  private spawnAt = -1;

  get dead(): boolean {
    return this.baseState === "dead";
  }

  /** Fin de la dissolution après la mort. */
  get gone(): boolean {
    return this.deathAt >= 0 && this.time - this.deathAt > 2.1;
  }

  // ---------------------------------------------------------------- apparence

  setTeam(team: Team): void {
    if (team === this.team) return;
    this.team = team;
    this.base.material = baseMaterial(team);
  }

  setItems(items: readonly string[]): void {
    this.gems.clear();
    items.forEach((id, i) => {
      const gem = new THREE.Mesh(GEM, gemMaterial(itemStyle(id).color));
      const angle = (i / Math.max(1, items.length)) * Math.PI * 2;
      gem.position.set(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55);
      this.gems.add(gem);
    });
  }

  /** Oriente le personnage vers un point (en douceur). */
  faceToward(x: number, z: number): void {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (dx * dx + dz * dz < 1e-4) return;
    this.yawTarget = Math.atan2(dx, dz);
  }

  faceDirection(yaw: number): void {
    this.yawTarget = yaw;
  }

  // ---------------------------------------------------------------- boucle

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    if (this.oneShotUntil && t >= this.oneShotUntil) {
      this.oneShotUntil = 0;
      this.returnToBase();
    }
    if (!this.frozen) for (const m of this.mixers) m.update(dt);

    // Rotation vers la cible.
    let d = this.yawTarget - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 10);
    this.root.rotation.y = this.yaw;

    // Effets de matériau.
    this.fx.flash = t < this.flashUntil ? 0.9 : Math.max(0, this.fx.flash - dt * 6);
    this.fx.stone += (this.stoneTarget - this.fx.stone) * Math.min(1, dt * 8);
    if (this.deathAt >= 0) {
      const k = (t - this.deathAt - 0.8) / 1.1;
      this.fx.dissolve = Math.max(0, Math.min(1, k));
      this.pantheonDisc.visible = k < 0;
      if (k > 0 && k < 1 && this.vfx && Math.random() < dt * 30) {
        const p = this.root.position;
        this.vfx.trail({ x: p.x + (Math.random() - 0.5) * 0.6, y: Math.random() * this.height, z: p.z + (Math.random() - 0.5) * 0.6 }, this.fx.rim, 0.12, 0.8, 3);
      }
    }
    if (this.spawnAt >= 0) {
      const k = Math.min(1, (t - this.spawnAt) / 0.35);
      const s = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 : 1;
      this.figure.scale.setScalar(Math.max(0.01, k * s));
      if (k >= 1) this.spawnAt = -1;
    }

    this.gems.rotation.y += dt * 1.2;
    if (this.starRing) this.starRing.rotation.z += dt * (this.star === 3 ? 1.2 : 0.6);
    for (const o of this.animated) {
      if (o.userData.flap !== undefined) o.rotation.z = (o.userData.baseZ ??= o.rotation.z) + Math.sin(t * 6 + (o.userData.flap as number)) * 0.18 * (o.userData.flap as number);
      if (o.userData.sway) o.rotation.z = Math.sin(t * 1.8) * 0.12;
      if (o.userData.spin) o.rotation.z += dt * 12;
    }

    // Aura de particules (personnage et étoiles).
    if (this.vfx && this.baseState !== "dead" && this.root.visible) {
      const q = this.vfx.settings.level;
      const rate = (this.spec.aura ? 7 : 0) + (this.star === 3 ? 10 : this.star === 2 ? 3 : 0);
      this.auraClock += dt * rate * (q === "low" ? 0.3 : q === "medium" ? 0.6 : 1);
      while (this.auraClock > 1) {
        this.auraClock -= 1;
        this.emitAura();
      }
    }
  }

  private emitAura(): void {
    const p = this.root.position;
    const vfx = this.vfx!;
    const useStar = this.star >= 2 && (!this.spec.aura || Math.random() < 0.5);
    const kind: AuraKind = useStar ? (this.star === 3 ? "sparks" : "stars") : this.spec.aura!;
    const c = new THREE.Color(useStar ? (this.star === 3 ? "#ffd24a" : "#e8f0ff") : AURA_COLORS[kind]);
    const a = Math.random() * Math.PI * 2;
    const r = 0.35 + Math.random() * 0.3;
    const x = p.x + Math.cos(a) * r;
    const z = p.z + Math.sin(a) * r;
    const h = this.height;
    switch (kind) {
      case "snow":
      case "sand":
        vfx.particle({ x, y: h * (0.4 + Math.random() * 0.8), z, vx: (Math.random() - 0.5) * 0.3, vy: -0.4, vz: (Math.random() - 0.5) * 0.3, life: 1.4, size: 0.06, color: c, intensity: 1.5 });
        break;
      case "smoke":
      case "shadow":
        vfx.particle({ x, y: 0.15, z, vy: 0.5, life: 1.3, size: 0.22, endSize: 2.5, color: c, intensity: kind === "shadow" ? 1.8 : 0.8, drag: 1 }, kind === "smoke");
        break;
      case "lightning":
        if (Math.random() < 0.3) vfx.particle({ x, y: Math.random() * h, z, life: 0.12, size: 0.16, color: c, intensity: 5 });
        else vfx.particle({ x, y: Math.random() * h, z, vy: 0.3, life: 0.4, size: 0.05, color: c, intensity: 3 });
        break;
      case "water":
        vfx.particle({ x, y: 0.1, z, vy: 1.6, vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4, gravity: -4, life: 0.7, size: 0.07, color: c, intensity: 1.6 });
        break;
      default:
        vfx.particle({ x, y: 0.1 + Math.random() * 0.3, z, vy: 0.6 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.2, vz: (Math.random() - 0.5) * 0.2, life: 1.2, size: kind === "embers" || kind === "sparks" ? 0.06 : 0.09, endSize: 0.2, color: c, intensity: 2.5, drag: 0.5 });
    }
  }

  /** Portrait : masque le socle, l'anneau d'étoiles et les gemmes d'objets. */
  setPortraitMode(): void {
    this.fx.rimStrength = 0;
    this.base.visible = false;
    this.pantheonDisc.visible = false;
    if (this.starRing) this.starRing.visible = false;
    this.gems.visible = false;
  }

  /** Corps humanoïde (KayKit ou Mixamo), par opposition aux créatures. */
  get humanoid(): boolean {
    return this.mixamo !== null || isHumanoid(this.spec.body);
  }

  /** Boîte englobante du corps seul (maillages animés, sans armes ni accessoires). */
  bodyBox(): THREE.Box3 {
    const box = new THREE.Box3();
    this.root.updateMatrixWorld(true);
    this.root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.visible) box.expandByObject(o, true);
    });
    return box;
  }

  /** Point d'impact (poitrine) en coordonnées monde. */
  chest(): THREE.Vector3 {
    return new THREE.Vector3(this.root.position.x, this.root.position.y + this.figure.position.y + this.height * 0.55, this.root.position.z);
  }

  /** Textures des matériaux d'origine du personnage (corps, accessoires, objets tenus). */
  textures(): Set<THREE.Texture> {
    const out = new Set<THREE.Texture>();
    for (const m of this.meshes) {
      const src = (m.userData.fxSource as { src: THREE.Material | THREE.Material[] } | undefined)?.src;
      for (const mat of Array.isArray(src) ? src : src ? [src] : []) {
        for (const v of Object.values(mat)) if ((v as THREE.Texture | null)?.isTexture) out.add(v as THREE.Texture);
      }
    }
    return out;
  }

  dispose(): void {
    this.disposed = true;
    for (const m of this.mixers) m.stopAllAction();
    this.root.removeFromParent();
  }

  /** Nom du clip en cours (débogage). */
  get animation(): string {
    return this.currentName;
  }
}

// ---------------------------------------------------------------- matériaux à effets partagés

interface MaterialOptions {
  recolor?: boolean;
  /** Matériau réaliste : garde normales, rugosité, transparence (cils, cheveux). */
  realistic?: boolean;
  /** Garde la métallicité d'origine (accessoires en or, armes). */
  keepMetal?: boolean;
  palette?: CharSpec["palette"];
  body?: BodyId;
  matColors?: Record<string, string>;
  tint?: string;
  glow?: string;
  eyes?: string;
  ghost?: boolean;
  dissolve?: boolean;
}

const DEFAULT_FX: FxState = { flash: 0, stone: 0, stoneColor: new THREE.Color("#8d8a84"), dissolve: 0, rim: new THREE.Color("#000000"), rimStrength: 0 };
const fxOf = (object: THREE.Object3D): FxState => (object.userData.fx as FxState | undefined) ?? DEFAULT_FX;
const WHITE = new THREE.Color(1, 1, 1);
/** Matériaux sources blancs des accessoires, par famille. */
const canonicalAccessory = new Map<string, THREE.MeshStandardMaterial>();
const BLACK = new THREE.Color(0, 0, 0);
type Frame = { object: THREE.Object3D };

/** Uniformes mis à jour pour chaque objet rendu, d'après object.userData.fx. */
const U = {
  flash: uniform(0).onObjectUpdate(({ object }: Frame) => fxOf(object).flash),
  stone: uniform(0).onObjectUpdate(({ object }: Frame) => fxOf(object).stone),
  stoneColor: uniform(new THREE.Color()).onObjectUpdate(({ object }: Frame) => fxOf(object).stoneColor),
  dissolve: uniform(0).onObjectUpdate(({ object }: Frame) => fxOf(object).dissolve),
  rim: uniform(new THREE.Color()).onObjectUpdate(({ object }: Frame) => fxOf(object).rim),
  rimStrength: uniform(0).onObjectUpdate(({ object }: Frame) => fxOf(object).rimStrength),
  tint: uniform(new THREE.Color(1, 1, 1)).onObjectUpdate(({ object }: Frame) => (object.userData.tint as THREE.Color | undefined) ?? WHITE),
  glow: uniform(new THREE.Color(0, 0, 0)).onObjectUpdate(({ object }: Frame) => (object.userData.glow as THREE.Color | undefined) ?? BLACK),
};

const effectMaterials = new Map<string, THREE.Material>();

/**
 * Matériau à effets construit à partir du matériau d'origine : recoloration de l'atlas,
 * reflet (Fresnel) aux couleurs du panthéon et des étoiles, flash blanc quand l'unité est
 * touchée, pierre ou glace, dissolution. Mis en cache : chaque variante n'est compilée qu'une fois.
 */
function effectMaterial(src: THREE.Material, o: MaterialOptions): THREE.Material {
  const s = src as THREE.MeshStandardMaterial;
  const named = o.matColors?.[s.name];
  const key = [s.uuid, o.palette ? JSON.stringify(o.palette) : "", named, s.name === "Glow" ? o.eyes : "", o.ghost, o.dissolve, o.realistic, o.keepMetal].join("|");
  const cached = effectMaterials.get(key);
  if (cached) return cached;

  const out = new THREE.MeshStandardNodeMaterial({ roughness: s.roughness ?? 0.7, metalness: Math.min(s.metalness ?? 0, 0.6), side: s.side });
  if (o.realistic) {
    out.normalMap = s.normalMap ?? null;
    if (s.normalScale) out.normalScale.copy(s.normalScale);
    out.roughnessMap = s.roughnessMap ?? null;
    out.metalnessMap = s.metalnessMap ?? null;
    out.aoMap = s.aoMap ?? null;
    // Les exports FBX donnent souvent une rugosité trop basse (aspect plastique).
    out.roughness = s.roughnessMap ? (o.keepMetal ? (s.roughness ?? 1) : 1) : Math.max(o.keepMetal ? 0.2 : 0.55, s.roughness ?? 0.7);
    out.metalness = s.metalnessMap ? 1 : o.keepMetal ? (s.metalness ?? 0) : Math.min(s.metalness ?? 0, 0.3);
  }
  let map = s.map ?? null;
  if (map && o.palette && o.body) map = recolorAtlas(o.body, map, o.palette);
  const baseColor = new THREE.Color().copy(s.color ?? new THREE.Color("#ffffff"));
  if (named) baseColor.set(named);
  const colorU = uniform(baseColor);
  const base: Node = (map ? texture(map).rgb.mul(colorU) : vec3(colorU)).mul(U.tint);
  const luma = dot(base, vec3(0.299, 0.587, 0.114));
  out.colorNode = mix(base, U.stoneColor.mul(luma.mul(0.9).add(0.35)), U.stone);
  const fresnel = pow(oneMinus(abs(dot(normalView, positionViewDirection))), 3);
  let emissive: Node = U.rim.mul(fresnel).mul(U.rimStrength).add(vec3(1, 1, 1).mul(U.flash));
  const srcEmissive = s.emissive && s.emissiveIntensity ? s.emissive.clone().multiplyScalar(s.emissiveIntensity) : null;
  if (s.name === "Glow" && o.eyes) emissive = emissive.add(vec3(uniform(new THREE.Color(o.eyes).multiplyScalar(3))));
  else if (srcEmissive && srcEmissive.r + srcEmissive.g + srcEmissive.b > 0.01) {
    // Avec une carte d'émission (yeux, runes lumineuses), seule la carte éclaire.
    emissive = emissive.add(s.emissiveMap ? texture(s.emissiveMap).rgb.mul(vec3(uniform(srcEmissive))) : vec3(uniform(srcEmissive)));
  }
  emissive = emissive.add(U.glow);
  // Parties transparentes (cils, cheveux, voiles) : on garde l'alpha de la texture.
  const cutout = map && (s.transparent || s.alphaTest > 0);
  if (cutout && !o.dissolve) {
    out.opacityNode = texture(map).a.mul(s.opacity ?? 1);
    out.alphaTest = s.alphaTest > 0 ? s.alphaTest : 0.4;
    out.transparent = false;
  }
  if (o.dissolve) {
    const noise = mx_noise_float(positionLocal.mul(5)).mul(0.5).add(0.5);
    const edge = oneMinus(smoothstep(0, 0.08, noise.sub(U.dissolve))).mul(step(0.001, U.dissolve));
    emissive = emissive.add(U.rim.mul(edge).mul(4));
    out.opacityNode = step(U.dissolve, noise).mul(o.ghost ? 0.6 : 1);
    out.alphaTest = 0.01;
  }
  out.emissiveNode = emissive;
  if (o.ghost) {
    out.transparent = true;
    out.opacity = 0.6;
    out.depthWrite = false;
  }
  effectMaterials.set(key, out);
  return out;
}

// ---------------------------------------------------------------- créatures

const smoothed = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/**
 * Les créatures Quaternius sont en facettes (normales par face) : on fusionne les sommets
 * et on recalcule des normales lissées pour un rendu plus naturel sous l'éclairage HDRI.
 */
/** Copie non entrelacée d'un attribut (même type de tableau, sans le journal de `clone()`). */
function deinterleave(a: THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const src = a.data.array as unknown as ArrayLike<number> & { constructor: new (n: number) => THREE.TypedArray };
  const out = new src.constructor(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) {
    for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = src[i * a.data.stride + a.offset + k]!;
  }
  return new THREE.BufferAttribute(out, a.itemSize, a.normalized);
}

function smoothCreature(model: THREE.Object3D): void {
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let g = smoothed.get(m.geometry);
    if (!g) {
      // Les attributs décodés par meshopt sont entrelacés : on les sépare d'abord.
      const src = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(m.geometry.attributes)) {
        if (name === "normal") continue;
        const a = attr as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
        src.setAttribute(name, (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? deinterleave(a as THREE.InterleavedBufferAttribute) : a.clone());
      }
      if (m.geometry.index) src.setIndex(m.geometry.index.clone());
      for (const g of m.geometry.groups) src.addGroup(g.start, g.count, g.materialIndex);
      g = mergeVertices(src, 1e-4);
      g.computeVertexNormals();
      smoothed.set(m.geometry, g);
    }
    m.geometry = g;
  });
}

// ---------------------------------------------------------------- animations Mixamo

/** Orientation et position (m) des objets tenus dans les mains Mixamo (axe y vers les doigts). */
export const MIXAMO_GRIP_ROT: Record<"r" | "l", [number, number, number]> = { r: [Math.PI / 2, 0, -Math.PI / 2], l: [Math.PI / 2, 0, Math.PI / 2] };
export const MIXAMO_GRIP_POS: Record<"r" | "l", [number, number, number]> = { r: [-0.03, 0.08, 0.03], l: [0.03, 0.08, 0.03] };

const mixamoClipCache = new Map<string, THREE.AnimationClip[]>();

/**
 * Animations de la bibliothèque Mixamo adaptées à un corps : on garde les rotations de tous
 * les os, et seulement la translation du bassin, mise à l'échelle de ce corps (les autres
 * translations imposeraient les proportions du mannequin d'origine).
 */
function mixamoClips(body: string, model: THREE.Object3D, anims: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): THREE.AnimationClip[] {
  const cached = mixamoClipCache.get(body);
  if (cached) return cached;
  const animHips = anims.scene.getObjectByName("mixamorigHips");
  const charHips = model.getObjectByName("mixamorigHips");
  const ratio = animHips && charHips && animHips.position.length() > 0 ? charHips.position.length() / animHips.position.length() : 1;
  const clips = anims.animations.map((clip) => {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const track of clip.tracks) {
      const [node, prop] = [track.name.slice(0, track.name.lastIndexOf(".")), track.name.slice(track.name.lastIndexOf(".") + 1)];
      const name = node.replace(/^mixamorig\d*:?/, "mixamorig");
      // Certains corps n'ont pas tous les doigts : pas de piste vers un os absent.
      if (!model.getObjectByName(name)) continue;
      if (prop === "quaternion") {
        const t = track.clone();
        t.name = `${name}.quaternion`;
        tracks.push(t);
      } else if (prop === "position" && name === "mixamorigHips") {
        const t = track.clone();
        t.name = `${name}.position`;
        const v = t.values;
        for (let i = 0; i < v.length; i++) v[i]! *= ratio;
        tracks.push(t);
      }
    }
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
  mixamoClipCache.set(body, clips);
  return clips;
}

// ---------------------------------------------------------------- ressources partagées

const BASE_RING = new THREE.RingGeometry(0.5, 0.62, 40);
/** Anneau hexagonal des ★2 et ★3. */
const STAR_RING = new THREE.RingGeometry(0.66, 0.72, 6, 1);
const DISC = new THREE.CircleGeometry(0.75, 32);
const GEM = new THREE.OctahedronGeometry(0.08);

const baseMats = new Map<Team, THREE.Material>();
function baseMaterial(team: Team): THREE.Material {
  let m = baseMats.get(team);
  if (!m) {
    const c = team === "ally" ? "#3fa9f5" : "#e5484d";
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), transparent: true, opacity: 0.9, depthWrite: false });
    baseMats.set(team, m);
  }
  return m;
}

const glowMats = new Map<string, THREE.Material>();
function glowMaterial(color: string, intensity: number): THREE.Material {
  const key = `${color}|${intensity}`;
  let m = glowMats.get(key);
  if (!m) {
    const n = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const c = uniform(new THREE.Color(color).multiplyScalar(intensity));
    const d = uv().sub(0.5).length().mul(2);
    n.colorNode = vec3(c);
    n.opacityNode = pow(oneMinus(d.min(1)), 1.5);
    m = n;
    glowMats.set(key, m);
  }
  return m;
}

const gemMats = new Map<string, THREE.Material>();
function gemMaterial(color: string): THREE.Material {
  let m = gemMats.get(color);
  if (!m) {
    const s = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.2, emissive: new THREE.Color(color), emissiveIntensity: 0.8 });
    m = s;
    gemMats.set(color, m);
  }
  return m;
}
