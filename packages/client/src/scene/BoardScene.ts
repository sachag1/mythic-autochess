// Scène 3D du plateau : rendu WebGPU (repli WebGL2 automatique) avec post-traitement
// (bloom, vignette, flash), arène réaliste, personnages animés, replay des combats avec
// effets de sorts, glisser-déposer et étiquettes HTML (étoiles, PV, mana, objets).
import * as THREE from "three/webgpu";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { hexDistance, HALF_ROWS, mirrorHex, MONSTERS, UNITS, type Team } from "@autochess/sim";
import { itemStyle, unitDef } from "../data/content";
import type { BattleReport, Location, PlayerSnap } from "../net/types";
import { assets, CORE_ASSETS, namedNode } from "./assets";
import { Arena } from "./arena";
import { Character, type StunStyle } from "./characters/Character";
import { MIXAMO_CHARACTERS } from "./characters/mixamo";
import { specFor } from "./characters/catalog";
import { BENCH_SIZE, benchToWorld, hexToWorld, nearestBenchSlot, nearestOwnHex, type Point } from "./layout";
import { QUALITY_PRESETS, QualityGovernor, type QualityLevel, type QualitySettings } from "./quality";
import { Replay, type ReplayFx, type ReplayUnit } from "./replay";
import { float, length, mix, pass, screenUV, smoothstep, vec2, vec3, vec4, type Node } from "./tsl";
import { playSpell, type SpellContext } from "./vfx/spells";
import { emitStatus, STUN_STYLE_BY_SOURCE, statusStyle } from "./vfx/status";
import { VfxSystem, type Vec3 } from "./vfx/VfxSystem";

export interface PlanningView {
  /** Joueur dont on montre le plateau et le banc (soi-même ou un adversaire observé). */
  player: PlayerSnap | null;
  own: boolean;
  canEditBoard: boolean;
  canEditBench: boolean;
}

export interface HoverInfo {
  defId: string;
  star: number;
  items: string[];
  enemy: boolean;
  x: number;
  y: number;
  hp?: number;
  maxHp?: number;
  mana?: number;
  maxMana?: number;
}

export interface SceneHandlers {
  onMove(from: Location, to: Location): void;
  onSell(from: Location): void;
  onHover(info: HoverInfo | null): void;
  onDrag(unit: { defId: string; star: number } | null): void;
  onReady?(backend: string): void;
  /** Progression du chargement des modèles (0 à 1). */
  onLoading?(progress: number, done: boolean): void;
}

interface Label {
  root: HTMLDivElement;
  bars: HTMLDivElement;
  hp: HTMLElement;
  shield: HTMLElement;
  mana: HTMLElement;
  items: HTMLDivElement;
}

interface View {
  key: string;
  char: Character;
  defId: string;
  star: number;
  itemsKey: string;
  enemy: boolean;
  label: Label;
  /** Position visée au sol ; la position affichée la rejoint en douceur. */
  target: Point;
  location: Location | null;
  draggable: boolean;
  replay: ReplayUnit | null;
  seen: boolean;
  statusAcc: Map<string, { v: number }>;
  stunned: boolean;
  shieldFx: { dispose(): void } | null;
}

export class BoardScene {
  readonly renderer: THREE.WebGPURenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  private readonly cameraBase = new THREE.Vector3();
  /** Caméra qui voit le calque 1 : précompilation des shaders des nouveaux modèles. */
  private readonly compileCamera = (() => {
    const c = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    c.layers.enable(1);
    return c;
  })();
  private readonly lookAt = new THREE.Vector3(0, 0, 2.4);
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly overlay: HTMLDivElement;
  private readonly resizeObserver: ResizeObserver;
  private width = 1;
  private height = 1;

  private quality: QualitySettings;
  private readonly governor: QualityGovernor;
  private pipeline: THREE.RenderPipeline | null = null;
  readonly vfx: VfxSystem;
  private readonly arena: Arena;

  private readonly views = new Map<string, View>();
  private planning: PlanningView = { player: null, own: true, canEditBoard: false, canEditBench: false };
  private replay: Replay | null = null;
  private battleStart = 0;
  private battleReport: BattleReport | null = null;
  private battleBoards: { me: PlayerSnap | null; opponent: PlayerSnap | null } = { me: null, opponent: null };
  private lastFrame = performance.now();
  private loaded = false;
  /** Orbes de butin lâchés par les monstres vaincus (rounds PvE), ouverts à la fin du combat. */
  private readonly orbs: { group: THREE.Group; born: number; base: THREE.Vector3 }[] = [];

  private pointer = new THREE.Vector2();
  private drag: { view: View; from: Location } | null = null;
  private hovered: View | null = null;
  backend = "";
  private disposed = false;
  private resolvePrewarm!: (p: Promise<void>) => void;
  /** Résolu quand tous les corps ont été préchauffés. */
  readonly prewarmed = new Promise<void>((r) => (this.resolvePrewarm = (p) => void p.then(r, r)));

  constructor(
    private readonly host: HTMLElement,
    private readonly handlers: SceneHandlers,
  ) {
    this.governor = new QualityGovernor((level) => this.applyQuality(level));
    this.quality = QUALITY_PRESETS[this.governor.level];

    const forceWebGL = new URLSearchParams(location.search).has("webgl");
    this.renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = "board-canvas";

    this.overlay = document.createElement("div");
    this.overlay.className = "unit-overlay";
    host.appendChild(this.overlay);

    this.vfx = new VfxSystem(this.quality);
    this.scene.add(this.vfx.root);
    this.arena = new Arena(this.scene, this.quality);
    this.spellCtx.vfx = this.vfx;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);

    // Modèles : les fichiers communs d'abord (écran de chargement), puis à la demande.
    const off = assets.onProgress((loaded, total) => this.handlers.onLoading?.(total ? loaded / total : 0, false));
    void Promise.all(CORE_ASSETS.map((p) => assets.load(p))).then(() => {
      off();
      this.loaded = true;
      this.handlers.onLoading?.(1, true);
      this.syncPlanning();
      this.resolvePrewarm(this.prewarmBodies());
    });

    void this.renderer.init().then(() => {
      if (this.disposed) return;
      const backend = this.renderer.backend as { isWebGPUBackend?: boolean };
      this.backend = backend.isWebGPUBackend ? "WebGPU" : "WebGL2";
      console.info(`[autochess] renderer: ${this.backend}, quality: ${this.quality.level}`);
      this.buildPipeline();
      this.vfx.prewarm();
      this.handlers.onReady?.(this.backend);
      this.renderer.setAnimationLoop(this.frame);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    for (const v of this.views.values()) v.char.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }

  // ---------------------------------------------------------------- rendu et qualité

  /** Post-traitement : scène → bloom → vignette et flash d'écran (tonalité ACES en sortie). */
  private buildPipeline(): void {
    const pipeline = new THREE.RenderPipeline(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    const color: Node = scenePass.getTextureNode("output");
    let out: Node = color;
    if (this.quality.bloom) out = color.add(bloom(color as never, 0.5, 0.4, 0.85) as unknown as Node);
    const d = length(screenUV.sub(0.5).mul(vec2(1.25, 1)));
    const vignette = mix(float(1), float(0.7), smoothstep(0.35, 0.95, d));
    out = vec4(out.rgb.mul(vignette).add(vec3(this.vfx.flashColor)), out.a);
    pipeline.outputNode = out;
    this.pipeline?.dispose();
    this.pipeline = pipeline;
  }

  private applyQuality(level: QualityLevel): void {
    this.quality = QUALITY_PRESETS[level];
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.vfx.setQuality(this.quality);
    this.arena.setQuality(this.quality);
    this.buildPipeline();
    this.resize();
  }

  get fps(): number {
    return this.governor.fps;
  }
  get qualityLevel(): QualityLevel {
    return this.quality.level;
  }

  /** Bannières aux couleurs du panthéon favori (présage). */
  setTheme(pantheon: string | null): void {
    this.arena.setTheme(pantheon);
  }

  private resize(): void {
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;
    // Caméra inclinée façon TFT ; on recule sur les écrans étroits pour garder le plateau entier.
    const back = Math.max(1, 1.6 / aspect);
    this.cameraBase.set(0, 22.5 * back, 21 * back);
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(this.lookAt);
    this.camera.setViewOffset(this.width, this.height, this.width > 900 ? 40 : 0, this.height * 0.07, this.width, this.height);
    this.camera.updateProjectionMatrix();
    this.compileCamera.copy(this.camera);
    this.compileCamera.layers.enable(1);
  }

  // ---------------------------------------------------------------- données

  setPlanning(view: PlanningView): void {
    this.planning = view;
    this.syncPlanning();
  }

  /**
   * Démarre (ou arrête) le replay d'un combat. `me` et `opponent` servent à retrouver les
   * objets portés par chaque unité (les plateaux sont publics et figés pendant le combat).
   */
  setBattle(battle: { report: BattleReport; startedAt: number } | null, me: PlayerSnap | null, opponent: PlayerSnap | null): void {
    this.battleBoards = { me, opponent };
    if (battle?.report === this.battleReport) return;
    this.battleReport = battle?.report ?? null;
    for (const v of [...this.views.values()]) if (v.replay) this.removeView(v);
    this.replay = battle ? new Replay(battle.report) : null;
    this.battleStart = battle?.startedAt ?? 0;
    this.syncPlanning();
  }

  /** Résultat du combat en cours de replay, une fois l'événement de fin atteint. */
  battleOutcome(): "win" | "loss" | "draw" | null {
    const r = this.replay;
    if (!r || !r.ended) return null;
    return r.winner === null ? "draw" : r.winner === r.mySide ? "win" : "loss";
  }

  private syncPlanning(): void {
    if (!this.loaded) return;
    const { player, own } = this.planning;
    for (const v of this.views.values()) if (!v.replay) v.seen = false;
    if (player) {
      if (!this.replay || !own) {
        for (const [key, unit] of Object.entries(player.board)) {
          const [col, row] = key.split(",").map(Number) as [number, number];
          this.upsertPlanningView(unit, { zone: "board", col, row }, own && this.planning.canEditBoard, !own);
        }
      }
      for (const [key, unit] of Object.entries(player.bench)) {
        this.upsertPlanningView(unit, { zone: "bench", index: Number(key) }, own && this.planning.canEditBench, !own);
      }
    }
    for (const v of [...this.views.values()]) if (!v.replay && !v.seen) this.removeView(v);
  }

  private upsertPlanningView(unit: { uid: string; defId: string; star: number; items: string[] }, location: Location, draggable: boolean, enemy: boolean): void {
    const key = `p:${unit.uid}`;
    let v = this.views.get(key);
    let starUp = false;
    let isNew = false;
    if (v && (v.defId !== unit.defId || v.star !== unit.star)) {
      starUp = unit.star > v.star;
      this.removeView(v);
      v = undefined;
    }
    const target = location.zone === "board" ? hexToWorld(location) : benchToWorld(location.index);
    if (!v) {
      v = this.createView(key, unit.defId, unit.star, enemy, null);
      v.char.root.position.set(target.x, 0, target.z);
      isNew = true;
    }
    if (v.enemy !== enemy) {
      v.enemy = enemy;
      v.char.setTeam(enemy ? "enemy" : "ally");
    }
    const itemsKey = unit.items.join(",");
    if (itemsKey !== v.itemsKey) {
      v.itemsKey = itemsKey;
      v.char.setItems(unit.items);
      renderItems(v.label.items, unit.items);
    }
    v.target = target;
    v.location = location;
    v.draggable = draggable;
    v.seen = true;
    // Les unités du joueur regardent vers l'adversaire (le haut du plateau).
    v.char.faceDirection(enemy ? 0 : Math.PI);
    if (starUp) this.starUpFx(v, unit.star);
    else if (isNew && document.visibilityState === "visible") this.spawnFx(v);
  }

  private createView(key: string, defId: string, star: number, enemy: boolean, replay: ReplayUnit | null): View {
    const char = new Character(defId, star, enemy ? "enemy" : "ally", this.vfx);
    char.root.userData.viewKey = key;
    char.setInCombat(Boolean(replay));
    this.scene.add(char.root);
    // Shaders compilés en tâche de fond avant l'affichage du modèle (pas de gel de l'image).
    // Le modèle est mis sur un calque invisible pour la caméra principale le temps de la compilation.
    void char.ready.then(async () => {
      if (this.disposed) return;
      char.figure.traverse((o) => o.layers.set(1));
      try {
        await this.renderer.compileAsync(char.figure, this.compileCamera, this.scene);
      } catch {
        /* compilation à la volée au premier rendu */
      }
      char.figure.traverse((o) => o.layers.set(0));
    });
    const label = createLabel(star, enemy);
    this.overlay.appendChild(label.root);
    label.bars.style.display = replay ? "" : "none";
    const view: View = { key, char, defId, star, itemsKey: "", enemy, label, target: { x: 0, z: 0 }, location: null, draggable: false, replay, seen: true, statusAcc: new Map(), stunned: false, shieldFx: null };
    this.views.set(key, view);
    return view;
  }

  private removeView(v: View): void {
    v.char.dispose();
    v.label.root.remove();
    v.shieldFx?.dispose();
    this.views.delete(v.key);
    if (this.hovered === v) {
      this.hovered = null;
      this.handlers.onHover(null);
    }
  }

  /**
   * Préchauffage en tâche de fond : un personnage par corps est chargé et ses shaders
   * (normaux et de dissolution) compilés hors écran, pour éviter les gels au premier combat.
   */
  private async prewarmBodies(): Promise<void> {
    const seen = new Set<string>();
    const ids = [...UNITS, ...MONSTERS].map((u) => u.id);
    for (const id of ids) {
      if (this.disposed) return;
      const key = bodyKey(id);
      if (seen.has(key)) continue;
      seen.add(key);
      await new Promise((r) => setTimeout(r, 120));
      const c = new Character(id, 1, "ally", null);
      await c.ready;
      if (this.disposed) return;
      c.root.position.set(0, -40, 0);
      c.root.traverse((o) => o.layers.set(1));
      this.scene.add(c.root);
      try {
        await this.renderer.compileAsync(c.root, this.compileCamera, this.scene);
        c.enableDissolve();
        await this.renderer.compileAsync(c.root, this.compileCamera, this.scene);
      } catch {
        /* sans gravité : compilation au premier affichage */
      }
      c.dispose();
    }
  }

  // ---------------------------------------------------------------- effets d'interface

  /** Fusion ★ : colonne et éclat de lumière dorés. */
  private starUpFx(v: View, star: number): void {
    const p = v.char.root.position;
    const c = new THREE.Color(star === 3 ? "#ffd24a" : "#dfe8ff");
    this.vfx.pillar(p, { radius: 0.7, height: 6, color: c, duration: 1.1, intensity: 4 });
    this.vfx.burst({ x: p.x, y: 1, z: p.z }, { count: 50, color: c, speed: 5, size: 0.14, intensity: 4, gravity: -2 });
    this.vfx.decal("star", p, { radius: 2.5, color: c, duration: 1 });
    this.vfx.light({ x: p.x, y: 1, z: p.z }, c, 40, 0.6);
    v.char.spawn();
    this.floatTextAt(p, star === 3 ? "★★★" : "★★", "star-up", v.char.height + 0.4);
  }

  /** Arrivée d'une unité (achat, armurerie). */
  private spawnFx(v: View): void {
    const p = v.char.root.position;
    v.char.spawn();
    this.vfx.decal("ring", p, { radius: 1.4, color: new THREE.Color("#9ad0ff"), duration: 0.5 });
    this.vfx.rise(p, { count: 14, color: new THREE.Color("#cfe6ff"), radius: 0.5, speed: 2 });
  }

  // ---------------------------------------------------------------- boucle

  private frame = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.governor.tick(now);

    if (this.replay) this.updateReplay(now - this.battleStart, dt);

    const follow = 1 - Math.exp(-dt * 14);
    for (const v of this.views.values()) {
      if (!v.replay && this.drag?.view !== v) {
        const p = v.char.root.position;
        p.x += (v.target.x - p.x) * follow;
        p.z += (v.target.z - p.z) * follow;
        p.y += (0 - p.y) * follow;
      }
      v.char.update(dt);
    }
    this.arena.update(dt, this.vfx);
    this.updateOrbs(now);
    this.vfx.update();

    const s = this.vfx.shakeOffset();
    this.camera.position.set(this.cameraBase.x + s.x, this.cameraBase.y + s.y, this.cameraBase.z + s.z);

    if (this.pipeline) this.pipeline.render();
    else this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  };

  private updateReplay(t: number, dt: number): void {
    const replay = this.replay!;
    replay.advance(t, this.fx);
    for (const u of replay.units.values()) {
      const v = this.views.get(`b:${u.id}`);
      if (!v) continue;
      const pos = this.replayPosition(u, t);
      v.char.root.position.set(pos.x, 0, pos.z);
      v.char.figure.position.y = pos.y;
      const moving = u.move !== null && t < u.move.start + u.move.dur;
      if (u.deadAt === null) v.char.setMoving(moving && pos.y < 0.05);
      if (moving) {
        const to = hexToWorld(u.move!.to);
        v.char.faceToward(to.x, to.z);
        if (pos.y > 0.05) this.vfx.trail({ x: pos.x, y: pos.y + 0.8, z: pos.z }, new THREE.Color("#c8b0ff"), 0.25, 0.4, 2.5);
      } else if (u.lastTarget !== null) {
        const tp = this.views.get(`b:${u.lastTarget}`)?.char.root.position;
        if (tp && replay.units.get(u.lastTarget)?.deadAt === null) v.char.faceToward(tp.x, tp.z);
      }
      // Étourdissement, avec un style selon la source (pierre, glace…).
      const stunned = replay.hasStatus(u, "stun", t) && u.deadAt === null;
      const stunStyle: StunStyle = u.stunSource !== null ? (STUN_STYLE_BY_SOURCE[replay.units.get(u.stunSource)?.defId ?? ""] ?? "stars") : "stars";
      if (stunned !== v.stunned) {
        v.stunned = stunned;
        v.char.stun(stunned, stunStyle);
      }
      if (u.deadAt === null) {
        for (const [type, until] of u.statuses) {
          if (until <= t) continue;
          if (type === "stun" && (stunStyle === "stone" || stunStyle === "ice")) continue;
          let acc = v.statusAcc.get(type);
          if (!acc) v.statusAcc.set(type, (acc = { v: 0 }));
          emitStatus(this.vfx, type, v.char.root.position, v.char.height, dt, acc);
        }
      }
      if (v.shieldFx && (replay.shieldOf(u, t) <= 0 || u.deadAt !== null)) {
        v.shieldFx.dispose();
        v.shieldFx = null;
      }
      if (v.char.gone) v.char.root.visible = false;
    }
  }

  private replayPosition(u: ReplayUnit, t: number): { x: number; z: number; y: number } {
    const m = u.move;
    if (m && t < m.start + m.dur) {
      const k = Math.max(0, Math.min(1, (t - m.start) / m.dur));
      const a = hexToWorld(m.from);
      const b = hexToWorld(m.to);
      const dist = hexDistance(m.from, m.to);
      // Les sauts (assassins) décrivent un arc.
      const y = dist > 1 ? Math.sin(Math.PI * k) * Math.min(3, 0.7 * dist) : 0;
      const e = dist > 1 ? k : k * k * (3 - 2 * k);
      return { x: a.x + (b.x - a.x) * e, z: a.z + (b.z - a.z) * e, y };
    }
    const p = hexToWorld(u.hex);
    return { x: p.x, z: p.z, y: 0 };
  }

  /** Objets d'une unité du combat, retrouvés sur le plateau de son propriétaire. */
  private replayItems(u: ReplayUnit, enemy: boolean): string[] {
    const owner = enemy ? this.battleBoards.opponent : this.battleBoards.me;
    if (!owner) return [];
    const hex = enemy ? mirrorHex(u.spawnHex) : u.spawnHex;
    const unit = owner.board[`${hex.col},${hex.row}`];
    return unit && unit.defId === u.defId ? unit.items : [];
  }

  private readonly tmp = new THREE.Vector3();

  private toScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = this.tmp.set(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height, visible: v.z < 1 };
  }

  private updateLabels(): void {
    const t = this.replay ? performance.now() - this.battleStart : 0;
    for (const v of this.views.values()) {
      const root = v.char.root;
      const dead = v.replay ? v.replay.deadAt !== null : false;
      if (!root.visible || dead) {
        v.label.root.style.display = "none";
        continue;
      }
      const p = root.position;
      const s = this.toScreen(p.x, p.y + v.char.figure.position.y + v.char.height + 0.35, p.z);
      v.label.root.style.display = s.visible ? "" : "none";
      v.label.root.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
      const u = v.replay;
      if (u && this.replay) {
        const shield = this.replay.shieldOf(u, t);
        const total = Math.max(u.maxHp, u.hp + shield, 1);
        v.label.hp.style.width = `${(Math.max(0, u.hp) / total) * 100}%`;
        v.label.shield.style.width = `${(shield / total) * 100}%`;
        v.label.mana.style.width = `${u.maxMana > 0 ? Math.min(100, (u.mana / u.maxMana) * 100) : 0}%`;
      }
    }
  }

  // ---------------------------------------------------------------- effets du combat

  private view(u: ReplayUnit): View | undefined {
    return this.views.get(`b:${u.id}`);
  }

  private readonly spellCtx: SpellContext = {
    vfx: null as unknown as VfxSystem,
    pos: (id) => {
      const v = this.views.get(`b:${id}`);
      if (!v || v.char.gone) return null;
      const p = v.char.root.position;
      return { x: p.x, y: 0, z: p.z };
    },
    chest: (id) => this.views.get(`b:${id}`)?.char.chest() ?? null,
    height: (id) => this.views.get(`b:${id}`)?.char.height ?? 1.5,
    defId: (id) => this.replay?.units.get(id)?.defId ?? "",
    units: (id, same) => {
      const r = this.replay;
      const team = r?.units.get(id)?.team;
      if (!r || team === undefined) return [];
      return [...r.units.values()].filter((u) => u.deadAt === null && (u.team === team) === same).map((u) => u.id);
    },
    prop: (id, scale = 1) => {
      const props = assets.get("props.glb");
      const src = props ? namedNode(props, id) : undefined;
      if (!src) return null;
      const o = src.clone(true);
      o.scale.setScalar(scale * 0.6);
      // Les armes sont modélisées le long de +y : on les couche le long de la trajectoire (+z).
      o.rotation.x = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(o);
      return holder;
    },
  };

  private readonly fx: ReplayFx = {
    spawn: (u) => {
      const enemy = u.team !== this.replay!.mySide;
      const v = this.createView(`b:${u.id}`, u.defId, u.star, enemy, u);
      const items = this.replayItems(u, enemy);
      if (items.length) {
        v.itemsKey = items.join(",");
        v.char.setItems(items);
        renderItems(v.label.items, items);
      }
      const p = hexToWorld(u.hex);
      v.char.root.position.set(p.x, 0, p.z);
      v.char.faceDirection(enemy ? 0 : Math.PI);
      v.char.spawn();
      this.vfx.decal("ring", { x: p.x, y: 0, z: p.z }, { radius: 1.2, color: new THREE.Color(enemy ? "#ff6a5a" : "#7ab8ff"), duration: 0.6 });
    },
    move: (u, durationMs) => {
      const v = this.view(u);
      if (!v || !u.move || hexDistance(u.move.from, u.move.to) <= 1) return;
      // Saut d'assassin : animation de saut, traînée et poussière au départ et à l'arrivée.
      v.char.leap(durationMs / 1000);
      const a = hexToWorld(u.move.from);
      const b = hexToWorld(u.move.to);
      const dust = new THREE.Color("#9a8a74");
      this.vfx.dust({ x: a.x, y: 0, z: a.z }, { count: 8, color: dust, radius: 0.3 });
      this.vfx.after(durationMs / 1000, () => {
        this.vfx.dust({ x: b.x, y: 0, z: b.z }, { count: 10, color: dust, radius: 0.3 });
        this.vfx.decal("ring", { x: b.x, y: 0, z: b.z }, { radius: 1.2, color: new THREE.Color("#c8b0ff"), duration: 0.4 });
      });
    },
    attack: (u, target, crit, impactInMs) => {
      const v = this.view(u);
      if (!v) return;
      v.char.attack();
      if ((unitDef(u.defId)?.stats.range ?? 1) <= 1) return;
      // Projectile de l'attaque à distance, lancé quand l'animation relâche le coup.
      const style = v.char.spec.attack;
      const color = new THREE.Color(style === "magic" ? "#b08aff" : style === "bow" || style === "crossbow" ? "#ffe6b0" : "#ffd27a");
      this.vfx.after(Math.max(0, impactInMs / 1000 - 0.26), () => {
        const from = v.char.chest();
        const to = () => this.view(target)?.char.chest() ?? from;
        const mesh = style === "bow" || style === "crossbow" ? this.spellCtx.prop("arrow", 0.9) : style === "thrown" ? this.spellCtx.prop("q_spear", 0.25) : null;
        this.vfx.projectile({
          from,
          to,
          duration: 0.26,
          arc: style === "magic" ? 0.2 : 0.35,
          mesh: mesh ?? undefined,
          trail: (p) => {
            this.vfx.trail(p, color, style === "magic" ? 0.2 : 0.08, 0.25, crit ? 5 : 3);
            if (!mesh) this.vfx.particle({ x: p.x, y: p.y, z: p.z, life: 0.06, size: 0.35, color, intensity: 4 });
          },
        });
      });
    },
    cast: (u, group, impactInMs) => {
      const v = this.view(u);
      if (!v) return;
      v.char.cast();
      playSpell(this.spellCtx, group, impactInMs / 1000);
      this.floatTextAt(v.char.root.position, group.ability, "cast", v.char.height + 0.7);
    },
    damage: (target, amount, type, crit) => {
      const v = this.view(target);
      if (!v || amount < 1) return;
      v.char.hit();
      const p = v.char.chest();
      const color = new THREE.Color(type === "magic" ? "#b06aff" : type === "true" ? "#ffffff" : "#ffb36b");
      this.vfx.burst(p, { count: crit ? 14 : 6, color, speed: crit ? 3.5 : 2, size: crit ? 0.12 : 0.08, life: 0.35, intensity: 3 });
      if (crit) {
        this.vfx.shake(0.06, 0.15);
        this.vfx.decal("star", { x: p.x, y: 0, z: p.z }, { radius: 0.9, color, duration: 0.3 });
      }
      this.floatText(target, `${Math.round(amount)}${crit ? "!" : ""}`, `dmg-${type}${crit ? " crit" : ""}`);
    },
    heal: (target, amount) => {
      const v = this.view(target);
      if (!v) return;
      this.vfx.rise(v.char.root.position, { count: Math.min(16, 4 + amount / 40), color: new THREE.Color("#6dff9b"), radius: 0.5, speed: 1.6, size: 0.1 });
      this.floatText(target, `+${Math.round(amount)}`, "heal");
    },
    shield: (target, amount, durationMs) => {
      const v = this.view(target);
      if (!v) return;
      if (!v.shieldFx) {
        const c = v.char;
        v.shieldFx = this.vfx.bubble(() => (c.root.visible ? { x: c.root.position.x, y: c.height * 0.5, z: c.root.position.z } : null), { radius: c.height * 0.62, color: new THREE.Color("#a8d8ff"), duration: durationMs / 1000 });
      }
      this.floatText(target, `+${Math.round(amount)}`, "shield");
    },
    status: (target, type, _durationMs, source) => {
      if (!this.view(target)) return;
      const fromSource = type === "stun" && source ? STUN_STYLE_BY_SOURCE[source.defId] : undefined;
      const label = fromSource === "stone" ? "Pétrifié" : fromSource === "ice" ? "Gelé" : statusStyle(type).label || type;
      if (type === "immunity") {
        const v = this.view(target)!;
        this.vfx.decal("runes", v.char.root.position, { radius: 1.4, color: new THREE.Color("#fff2c0"), duration: 0.8, spin: 2 });
      }
      this.floatText(target, label, "stun");
    },
    buff: (target, _stat, amount) => {
      const v = this.view(target);
      if (!v) return;
      const p = v.char.root.position;
      // Bonus : étincelles dorées qui montent ; malus (montant négatif) : voile violet qui retombe.
      if (amount >= 0) this.vfx.rise(p, { count: 6, color: new THREE.Color("#ffd76a"), radius: 0.4, speed: 2.2, size: 0.07 });
      else for (let i = 0; i < 8; i++) this.vfx.particle({ x: p.x + (Math.random() - 0.5) * 0.8, y: v.char.height, z: p.z + (Math.random() - 0.5) * 0.8, vy: -1.2, life: 0.8, size: 0.09, color: new THREE.Color("#9a5aff"), intensity: 2.5 });
    },
    death: (u) => {
      const v = this.view(u);
      if (!v) return;
      v.char.die();
      this.vfx.burst(v.char.chest(), { count: 30, color: new THREE.Color("#ffffff"), speed: 3, size: 0.12, intensity: 3 });
      const q = v.char.root.position;
      this.vfx.after(0.8, () => {
        this.vfx.rise({ x: q.x, y: 0, z: q.z }, { count: 24, color: new THREE.Color(v.enemy ? "#ff8a7a" : "#9ad0ff"), radius: 0.4, speed: 2.5, size: 0.12 });
        this.vfx.decal("disc", { x: q.x, y: 0, z: q.z }, { radius: 1, color: new THREE.Color("#ffffff"), duration: 0.8, intensity: 0.8 });
      });
      v.shieldFx?.dispose();
      v.shieldFx = null;
      if (this.battleReport?.opponentId === null && v.enemy && this.orbs.length < 4) this.dropOrb(q.x, q.z);
    },
    end: (winner: Team | null) => {
      const r = this.replay!;
      for (const u of r.units.values()) {
        const v = this.view(u);
        if (v && u.deadAt === null && winner !== null && u.team === winner) v.char.victory(Math.random() < 0.5);
      }
      if (winner === r.mySide) {
        this.vfx.flash("#fff2c0", 0.25, 0.4);
        const colors = ["#ffd24a", "#7ab8ff", "#ff7ab8"];
        for (let i = 0; i < 6; i++) this.vfx.after(i * 0.15, () => this.vfx.burst({ x: (Math.random() - 0.5) * 10, y: 4 + Math.random() * 2, z: (Math.random() - 0.5) * 8 }, { count: 30, color: new THREE.Color(colors[i % 3]!), speed: 4, size: 0.1, gravity: -3, intensity: 4, life: 1.2 }));
      }
    },
    other: () => undefined,
  };

  // ---------------------------------------------------------------- orbes de butin

  private dropOrb(x: number, z: number): void {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(ORB_GEO, ORB_MAT);
    const core = new THREE.Mesh(ORB_CORE_GEO, ORB_CORE_MAT);
    shell.castShadow = true;
    group.add(shell, core);
    group.position.set(x, 2.5, z);
    this.scene.add(group);
    this.orbs.push({ group, born: performance.now(), base: new THREE.Vector3(x, 0.75, z) });
    this.vfx.burst({ x, y: 1.5, z }, { count: 16, color: new THREE.Color("#9ad0ff"), speed: 2, size: 0.1, intensity: 3 });
  }

  private updateOrbs(now: number): void {
    for (const o of this.orbs) {
      const age = (now - o.born) / 1000;
      if (o.group.userData.flying) continue;
      // Chute avec rebond, puis flottement.
      const fall = Math.min(1, age / 0.6);
      const bounce = fall < 1 ? (1 - fall) * 1.8 * Math.abs(Math.cos(fall * Math.PI * 1.5)) : 0;
      o.group.position.y = o.base.y + bounce + Math.sin(age * 2.5) * 0.08 * fall;
      o.group.rotation.y = age * 1.2;
      if (Math.random() < 0.15) this.vfx.trail({ x: o.group.position.x, y: o.group.position.y, z: o.group.position.z }, new THREE.Color("#bfe0ff"), 0.12, 0.6, 2);
    }
  }

  /**
   * Ouvre le butin du dernier round PvE : les orbes (ou un orbe s'il n'y en a pas) filent
   * vers le banc et éclatent aux couleurs du butin (or, objet, champion).
   */
  openLoot(loot: readonly string[]): void {
    if (!this.orbs.length) this.dropOrb(0, -2);
    const colors = loot.map((l) => (l.startsWith("gold:") ? "#ffd24a" : l.startsWith("unit:") || l.startsWith("sold:") ? "#c890ff" : "#7ab8ff"));
    const target = new THREE.Vector3(0, 1.2, benchToWorld(4).z);
    this.orbs.forEach((o, i) => {
      o.group.userData.flying = true;
      const from = o.group.position.clone();
      const c = new THREE.Color(colors[i % Math.max(1, colors.length)] ?? "#7ab8ff");
      this.vfx.after(i * 0.15, () =>
        this.vfx.projectile({
          from,
          to: () => target,
          duration: 0.7,
          arc: 2.5,
          mesh: o.group,
          trail: (p) => this.vfx.trail(p, c, 0.2, 0.4, 3),
          onArrive: (p) => {
            this.vfx.burst(p, { count: 40, color: c, speed: 4, size: 0.14, intensity: 4, gravity: -2 });
            this.vfx.decal("star", { x: p.x, y: 0, z: p.z }, { radius: 2, color: c, duration: 0.7 });
            this.vfx.light(p, c, 30, 0.5);
          },
        }),
      );
    });
    this.orbs.length = 0;
  }

  private floatText(unit: ReplayUnit, text: string, cls: string): void {
    const v = this.views.get(`b:${unit.id}`);
    const h = hexToWorld(unit.hex);
    this.floatTextAt(v ? v.char.root.position : { x: h.x, z: h.z }, text, cls, (v?.char.height ?? 1.5) * 0.8);
  }

  private floatTextAt(p: { x: number; z: number }, text: string, cls: string, y: number): void {
    const s = this.toScreen(p.x, y, p.z);
    const el = document.createElement("div");
    el.className = `float-text ${cls}`;
    el.textContent = text;
    el.style.left = `${s.x + (Math.random() - 0.5) * 30}px`;
    el.style.top = `${s.y}px`;
    this.overlay.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  // ---------------------------------------------------------------- souris

  private setPointer(e: { clientX: number; clientY: number }): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  /** Unité sous le curseur : distance du rayon à l'axe de l'unité (fiable avec les animations). */
  private pickView(): View | null {
    let best: View | null = null;
    let bestD = Infinity;
    const ray = this.raycaster.ray;
    const p = new THREE.Vector3();
    for (const v of this.views.values()) {
      if (!v.char.root.visible || (v.replay && v.replay.deadAt !== null)) continue;
      const c = v.char.root.position;
      p.set(c.x, c.y + v.char.height * 0.5, c.z);
      const d = ray.distanceToPoint(p);
      if (d < 0.75 && d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  private groundPoint(): Point | null {
    const p = this.raycaster.ray.intersectPlane(this.ground, this.tmp);
    return p ? { x: p.x, z: p.z } : null;
  }

  /** Emplacement de l'unité du joueur sous le curseur (pour équiper un objet). */
  locationAt(clientX: number, clientY: number): Location | null {
    this.setPointer({ clientX, clientY });
    const v = this.pickView();
    if (v?.location && !v.enemy && !v.replay) return v.location;
    const g = this.groundPoint();
    if (!g) return null;
    const hex = nearestOwnHex(g);
    const slot = nearestBenchSlot(g);
    for (const view of this.views.values()) {
      const l = view.location;
      if (!l || view.enemy || view.replay) continue;
      if (hex && l.zone === "board" && l.col === hex.col && l.row === hex.row && !this.replay) return l;
      if (slot !== null && l.zone === "bench" && l.index === slot) return l;
    }
    return null;
  }

  hoveredLocation(): Location | null {
    const v = this.hovered;
    return v && !v.enemy && !v.replay ? v.location : null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.setPointer(e);
    const v = this.pickView();
    if (!v || !v.draggable || !v.location) return;
    this.drag = { view: v, from: v.location };
    // Écoute sur la fenêtre : le lâcher peut se faire au-dessus de l'interface (vente).
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    this.handlers.onHover(null);
    this.handlers.onDrag({ defId: v.defId, star: v.star });
  };

  private onPointerMove = (e: PointerEvent): void => {
    // Pendant un glisser, seul l'écouteur de la fenêtre traite le mouvement.
    if (this.drag && e.currentTarget !== window) return;
    this.setPointer(e);
    if (this.drag) {
      const g = this.groundPoint();
      if (!g) return;
      this.drag.view.char.root.position.set(g.x, 0.7, g.z);
      this.setHighlight(this.dropTarget(g));
      return;
    }
    const v = this.pickView();
    if (v !== this.hovered) this.hovered = v;
    this.renderer.domElement.style.cursor = v?.draggable ? "grab" : "default";
    if (!v) {
      this.handlers.onHover(null);
      return;
    }
    const items = v.itemsKey ? v.itemsKey.split(",") : [];
    const u = v.replay;
    this.handlers.onHover({
      defId: v.defId,
      star: v.star,
      items,
      enemy: v.enemy,
      x: e.clientX,
      y: e.clientY,
      ...(u ? { hp: Math.max(0, Math.round(u.hp)), maxHp: Math.round(u.maxHp), mana: Math.round(u.mana), maxMana: u.maxMana } : {}),
    });
  };

  private onPointerLeave = (): void => {
    if (this.drag) return;
    this.hovered = null;
    this.handlers.onHover(null);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.setHighlight(null);
    this.handlers.onDrag(null);

    const over = document.elementFromPoint(e.clientX, e.clientY);
    if (over?.closest("[data-sell-zone]")) {
      const p = drag.view.char.root.position;
      this.vfx.burst({ x: p.x, y: 0.8, z: p.z }, { count: 24, color: new THREE.Color("#ffd24a"), speed: 3, size: 0.1, intensity: 3 });
      this.handlers.onSell(drag.from);
      return;
    }
    this.setPointer(e);
    const g = this.groundPoint();
    const to = g ? this.dropTarget(g) : null;
    if (to && !sameLocation(to, drag.from)) {
      // Déplacement optimiste ; l'état du serveur corrigera si l'action est refusée.
      const other = [...this.views.values()].find((v) => v !== drag.view && !v.replay && v.location && sameLocation(v.location, to));
      drag.view.target = to.zone === "board" ? hexToWorld(to) : benchToWorld(to.index);
      if (other) other.target = drag.from.zone === "board" ? hexToWorld(drag.from) : benchToWorld(drag.from.index);
      const dest = drag.view.target;
      this.vfx.after(0.15, () => this.vfx.decal("ring", { x: dest.x, y: 0, z: dest.z }, { radius: 1.1, color: new THREE.Color("#9ad0ff"), duration: 0.4 }));
      this.handlers.onMove(drag.from, to);
    }
  };

  private dropTarget(g: Point): Location | null {
    const hex = this.planning.canEditBoard ? nearestOwnHex(g) : null;
    if (hex) return { zone: "board", col: hex.col, row: hex.row };
    const slot = this.planning.canEditBench ? nearestBenchSlot(g) : null;
    if (slot !== null) return { zone: "bench", index: slot };
    return null;
  }

  private setHighlight(location: Location | null): void {
    this.arena.highlightHex(location?.zone === "board" && location.row < HALF_ROWS ? location.col : null, location?.zone === "board" ? location.row : 0);
    this.arena.highlightBench(location?.zone === "bench" && location.index < BENCH_SIZE ? location.index : null);
  }
}

/** Corps utilisé par une unité (Mixamo si disponible, sinon catalogue) : clé de préchauffage. */
function bodyKey(defId: string): string {
  const mx = MIXAMO_CHARACTERS[defId];
  return mx ? `mx:${mx.body}` : `kk:${specFor(defId).body}`;
}

const ORB_GEO = new THREE.SphereGeometry(0.32, 32, 16);
const ORB_MAT = new THREE.MeshPhysicalMaterial({ color: "#cfe6ff", metalness: 0, roughness: 0.05, transmission: 0.6, thickness: 0.4, transparent: true, opacity: 0.85, emissive: new THREE.Color("#3a7aff"), emissiveIntensity: 0.6 });
const ORB_CORE_GEO = new THREE.IcosahedronGeometry(0.13, 1);
const ORB_CORE_MAT = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: new THREE.Color("#bfe0ff"), emissiveIntensity: 3 });

function sameLocation(a: Location, b: Location): boolean {
  if (a.zone === "bench" && b.zone === "bench") return a.index === b.index;
  if (a.zone === "board" && b.zone === "board") return a.col === b.col && a.row === b.row;
  return false;
}

function createLabel(star: number, enemy: boolean): Label {
  const root = document.createElement("div");
  root.className = `unit-label${enemy ? " enemy" : ""}`;
  const stars = document.createElement("div");
  stars.className = `stars star-${star}`;
  stars.textContent = "★".repeat(star);
  const bars = document.createElement("div");
  bars.className = "bars";
  const hpBar = document.createElement("div");
  hpBar.className = "hp-bar";
  const hp = document.createElement("i");
  hp.className = "hp";
  const shield = document.createElement("i");
  shield.className = "shield";
  hpBar.append(hp, shield);
  const manaBar = document.createElement("div");
  manaBar.className = "mana-bar";
  const mana = document.createElement("i");
  manaBar.append(mana);
  bars.append(hpBar, manaBar);
  const items = document.createElement("div");
  items.className = "items";
  root.append(stars, bars, items);
  return { root, bars, hp, shield, mana, items };
}

function renderItems(el: HTMLDivElement, items: readonly string[]): void {
  el.replaceChildren(
    ...items.map((id) => {
      const s = itemStyle(id);
      const chip = document.createElement("span");
      chip.style.background = s.color;
      chip.textContent = s.short;
      return chip;
    }),
  );
}

/** Pour les effets qui veulent un point 3D à partir d'une position au sol. */
export type { Vec3 };
