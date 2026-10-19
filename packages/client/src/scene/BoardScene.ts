// Scène 3D du plateau : rendu WebGPU (repli WebGL2 automatique), unités du joueur en
// préparation, replay des combats, glisser-déposer et étiquettes HTML (étoiles, barres, objets).
import * as THREE from "three/webgpu";
import { BOARD_COLS, BOARD_ROWS, HALF_ROWS, hexDistance, hexKey, mirrorHex, type DamageType } from "@autochess/sim";
import { itemStyle, unitColor, unitDef } from "../data/content";
import type { BattleReport, Location, PlayerSnap } from "../net/types";
import { BENCH_SIZE, BENCH_Z, benchToWorld, hexToWorld, nearestBenchSlot, nearestOwnHex, type Point } from "./layout";
import { Replay, type ReplayFx, type ReplayUnit } from "./replay";
import { createProjectile, createRing, createUnitMesh, setTeam, setUnitItems, type UnitMesh } from "./unitMesh";

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
  mesh: UnitMesh;
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
}

interface Effect {
  update(now: number): boolean;
  dispose(): void;
}

const COLORS = {
  background: "#0f1118",
  ownTile: ["#2a3654", "#2f3c5d"],
  enemyTile: ["#2d2a35", "#33303c"],
  highlight: "#5b8def",
  bench: "#232837",
};

export class BoardScene {
  readonly renderer: THREE.WebGPURenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly overlay: HTMLDivElement;
  private readonly resizeObserver: ResizeObserver;
  private width = 1;
  private height = 1;

  private readonly tiles: THREE.Mesh[] = [];
  private readonly benchSlots: THREE.Mesh[] = [];
  private readonly tileMaterials: THREE.MeshStandardMaterial[];
  private readonly highlightMaterial: THREE.MeshStandardMaterial;
  private readonly benchMaterial: THREE.MeshStandardMaterial;
  private highlighted: THREE.Mesh | null = null;

  private readonly views = new Map<string, View>();
  private readonly effects: Effect[] = [];
  private planning: PlanningView = { player: null, own: true, canEditBoard: false, canEditBench: false };
  private replay: Replay | null = null;
  private battleStart = 0;
  private battleReport: BattleReport | null = null;
  private battleBoards: { me: PlayerSnap | null; opponent: PlayerSnap | null } = { me: null, opponent: null };
  private lastFrame = performance.now();

  private pointer = new THREE.Vector2();
  private drag: { view: View; from: Location } | null = null;
  private hovered: View | null = null;
  backend = "";
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly handlers: SceneHandlers,
  ) {
    // `?webgl` dans l'adresse force le repli WebGL2 (tests).
    const forceWebGL = new URLSearchParams(location.search).has("webgl");
    this.renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = "board-canvas";

    this.overlay = document.createElement("div");
    this.overlay.className = "unit-overlay";
    host.appendChild(this.overlay);

    this.tileMaterials = [...COLORS.ownTile, ...COLORS.enemyTile].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    this.highlightMaterial = new THREE.MeshStandardMaterial({ color: COLORS.highlight, emissive: COLORS.highlight, emissiveIntensity: 0.35, roughness: 0.6 });
    this.benchMaterial = new THREE.MeshStandardMaterial({ color: COLORS.bench, roughness: 0.85 });
    this.buildWorld();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);

    void this.renderer.init().then(() => {
      if (this.disposed) return;
      const backend = this.renderer.backend as { isWebGPUBackend?: boolean };
      this.backend = backend.isWebGPUBackend ? "WebGPU" : "WebGL2";
      console.info(`[autochess] renderer: ${this.backend}`);
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
    for (const e of this.effects) e.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }

  // ---------------------------------------------------------------- monde

  private buildWorld(): void {
    const s = this.scene;
    s.background = new THREE.Color(COLORS.background);
    s.fog = new THREE.Fog(COLORS.background, 30, 60);

    s.add(new THREE.HemisphereLight("#bcd0ff", "#2a2233", 1.1));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.4);
    sun.position.set(-6, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -12;
    cam.right = 12;
    cam.top = 12;
    cam.bottom = -12;
    cam.near = 1;
    cam.far = 40;
    sun.shadow.bias = -0.0005;
    s.add(sun);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: "#151823", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.31;
    ground.receiveShadow = true;
    s.add(ground);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.4, 13.4), new THREE.MeshStandardMaterial({ color: "#1c2030", roughness: 0.9 }));
    slab.position.set(0, -0.2, 0);
    slab.receiveShadow = true;
    s.add(slab);

    const tileGeometry = new THREE.CylinderGeometry(0.94, 0.94, 0.16, 6);
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const tile = new THREE.Mesh(tileGeometry, this.baseTileMaterial(col, row));
        const p = hexToWorld({ col, row });
        tile.position.set(p.x, 0, p.z);
        tile.receiveShadow = true;
        tile.userData = { col, row };
        this.tiles[hexKey({ col, row })] = tile;
        s.add(tile);
      }
    }

    // Ligne de séparation entre les deux moitiés.
    const line = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.02, 0.06), new THREE.MeshBasicMaterial({ color: "#6d7fb3" }));
    line.position.set(0, 0.09, 0);
    s.add(line);

    const benchSlab = new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.3, 2.1), new THREE.MeshStandardMaterial({ color: "#1a1d29", roughness: 0.9 }));
    benchSlab.position.set(0, -0.15, BENCH_Z);
    benchSlab.receiveShadow = true;
    s.add(benchSlab);
    const slotGeometry = new THREE.BoxGeometry(1.4, 0.1, 1.4);
    for (let i = 0; i < BENCH_SIZE; i++) {
      const slot = new THREE.Mesh(slotGeometry, this.benchMaterial);
      const p = benchToWorld(i);
      slot.position.set(p.x, 0.02, p.z);
      slot.receiveShadow = true;
      this.benchSlots.push(slot);
      s.add(slot);
    }
  }

  private baseTileMaterial(col: number, row: number): THREE.MeshStandardMaterial {
    const shade = (col + row) % 2;
    return this.tileMaterials[(row < HALF_ROWS ? 0 : 2) + shade]!;
  }

  private resize(): void {
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;
    // Caméra inclinée façon TFT ; on recule sur les écrans étroits pour garder le plateau entier.
    const back = Math.max(1, 1.6 / aspect);
    this.camera.position.set(0, 21 * back, 16.5 * back);
    this.camera.lookAt(0, 0, 1.6);
    // Décale l'image pour centrer le plateau dans l'espace laissé libre par l'interface
    // (boutique en bas, joueurs à droite).
    this.camera.setViewOffset(this.width, this.height, this.width > 900 ? 40 : 0, this.height * 0.09, this.width, this.height);
    this.camera.updateProjectionMatrix();
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
    const { player, own } = this.planning;
    for (const v of this.views.values()) if (!v.replay) v.seen = false;
    if (player) {
      const showBoard = !this.replay || !own;
      if (showBoard) {
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
    if (v && (v.defId !== unit.defId || v.star !== unit.star)) {
      this.removeView(v);
      v = undefined;
    }
    const target = location.zone === "board" ? hexToWorld(location) : benchToWorld(location.index);
    if (!v) {
      v = this.createView(key, unit.defId, unit.star, enemy, null);
      v.mesh.root.position.set(target.x, 0, target.z);
    }
    if (v.enemy !== enemy) {
      v.enemy = enemy;
      setTeam(v.mesh, enemy ? "enemy" : "ally");
    }
    const itemsKey = unit.items.join(",");
    if (itemsKey !== v.itemsKey) {
      v.itemsKey = itemsKey;
      setUnitItems(v.mesh, unit.items);
      renderItems(v.label.items, unit.items);
    }
    v.target = target;
    v.location = location;
    v.draggable = draggable;
    v.seen = true;
  }

  private createView(key: string, defId: string, star: number, enemy: boolean, replay: ReplayUnit | null): View {
    const mesh = createUnitMesh(defId, star, enemy ? "enemy" : "ally");
    mesh.root.userData.viewKey = key;
    this.scene.add(mesh.root);
    const label = createLabel(star, enemy);
    this.overlay.appendChild(label.root);
    label.bars.style.display = replay ? "" : "none";
    const view: View = { key, mesh, defId, star, itemsKey: "", enemy, label, target: { x: 0, z: 0 }, location: null, draggable: false, replay, seen: true };
    this.views.set(key, view);
    return view;
  }

  private removeView(v: View): void {
    this.scene.remove(v.mesh.root);
    v.label.root.remove();
    this.views.delete(v.key);
    if (this.hovered === v) {
      this.hovered = null;
      this.handlers.onHover(null);
    }
  }

  // ---------------------------------------------------------------- boucle

  private frame = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (this.replay) this.updateReplay(now - this.battleStart);

    const follow = 1 - Math.exp(-dt * 14);
    for (const v of this.views.values()) {
      if (v.replay) continue;
      if (this.drag?.view === v) continue;
      const p = v.mesh.root.position;
      p.x += (v.target.x - p.x) * follow;
      p.z += (v.target.z - p.z) * follow;
      p.y += (0 - p.y) * follow;
    }
    for (const v of this.views.values()) {
      v.mesh.gems.rotation.y += dt * 1.2;
      if (v.mesh.stun.visible) v.mesh.stun.rotation.z += dt * 5;
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (!this.effects[i]!.update(now)) {
        this.effects[i]!.dispose();
        this.effects.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  };

  private updateReplay(t: number): void {
    const replay = this.replay!;
    replay.advance(t, this.fx);
    for (const u of replay.units.values()) {
      const key = `b:${u.id}`;
      let v = this.views.get(key);
      if (!v) {
        const enemy = u.team !== replay.mySide;
        v = this.createView(key, u.defId, u.star, enemy, u);
        const items = this.replayItems(u, enemy);
        if (items.length) {
          v.itemsKey = items.join(",");
          setUnitItems(v.mesh, items);
          renderItems(v.label.items, items);
        }
        const p = hexToWorld(u.hex);
        v.mesh.root.position.set(p.x, 0, p.z);
      }
      const root = v.mesh.root;
      const pos = this.replayPosition(u, t);
      root.position.set(pos.x, 0, pos.z);
      v.mesh.figure.position.y = pos.y;

      // Élan vers la cible pendant une attaque.
      v.mesh.figure.position.x = 0;
      v.mesh.figure.position.z = 0;
      if (u.lunge && t - u.lunge.at < 220) {
        const target = replay.units.get(u.lunge.target);
        if (target) {
          const tp = hexToWorld(target.hex);
          const dx = tp.x - pos.x;
          const dz = tp.z - pos.z;
          const len = Math.hypot(dx, dz) || 1;
          const k = Math.sin((Math.PI * (t - u.lunge.at)) / 220) * (unitRange(u.defId) > 1 ? 0.12 : 0.4);
          v.mesh.figure.position.x = (dx / len) * k;
          v.mesh.figure.position.z = (dz / len) * k;
        }
      }
      // Sort : petit bond et rotation de l'emblème.
      const sinceCast = t - u.castAt;
      if (sinceCast < 400) v.mesh.figure.position.y += Math.sin((Math.PI * sinceCast) / 400) * 0.35;

      v.mesh.shield.visible = replay.shieldOf(u, t) > 0 && u.deadAt === null;
      v.mesh.stun.visible = u.stunUntil > t && u.deadAt === null;

      if (u.deadAt !== null) {
        const k = Math.min(1, (t - u.deadAt) / 500);
        v.mesh.figure.scale.setScalar(v.mesh.scale * (1 - k));
        v.mesh.base.visible = k < 1;
        root.visible = k < 1;
      }
    }
  }

  /** Objets d'une unité du combat, retrouvés sur le plateau de son propriétaire. */
  private replayItems(u: ReplayUnit, enemy: boolean): string[] {
    const owner = enemy ? this.battleBoards.opponent : this.battleBoards.me;
    if (!owner) return [];
    // Vue retournée si besoin : nos unités sont à leur case, celles de l'adversaire en miroir.
    const hex = enemy ? mirrorHex(u.spawnHex) : u.spawnHex;
    const unit = owner.board[`${hex.col},${hex.row}`];
    return unit && unit.defId === u.defId ? unit.items : [];
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
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y };
    }
    const p = hexToWorld(u.hex);
    return { x: p.x, z: p.z, y: 0 };
  }

  private readonly tmp = new THREE.Vector3();

  private toScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = this.tmp.set(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height, visible: v.z < 1 };
  }

  private updateLabels(): void {
    const t = this.replay ? performance.now() - this.battleStart : 0;
    for (const v of this.views.values()) {
      const root = v.mesh.root;
      const dead = v.replay?.deadAt !== null && v.replay?.deadAt !== undefined;
      if (!root.visible || dead) {
        v.label.root.style.display = "none";
        continue;
      }
      const p = root.position;
      const s = this.toScreen(p.x, p.y + v.mesh.figure.position.y + v.mesh.height + 0.25, p.z);
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

  // ---------------------------------------------------------------- effets

  private readonly fx: ReplayFx = {
    attack: (unit, target) => {
      if (unitRange(unit.defId) <= 1) return;
      const from = hexToWorld(unit.hex);
      const to = hexToWorld(target.hex);
      const projectile = createProjectile(unitColor(unitDef(unit.defId)));
      this.scene.add(projectile);
      const start = performance.now();
      const duration = 140 + Math.hypot(to.x - from.x, to.z - from.z) * 35;
      this.effects.push({
        update: (now) => {
          const k = Math.min(1, (now - start) / duration);
          projectile.position.set(from.x + (to.x - from.x) * k, 0.9 + Math.sin(Math.PI * k) * 0.6, from.z + (to.z - from.z) * k);
          return k < 1;
        },
        dispose: () => this.scene.remove(projectile),
      });
    },
    damage: (target, amount, type, crit) => {
      if (amount < 1) return;
      this.floatText(target, `${Math.round(amount)}${crit ? "!" : ""}`, `dmg-${type satisfies DamageType}${crit ? " crit" : ""}`);
    },
    heal: (target, amount) => this.floatText(target, `+${Math.round(amount)}`, "heal"),
    shield: (target, amount) => this.floatText(target, `+${Math.round(amount)}`, "shield"),
    stun: (target) => this.floatText(target, "Étourdi", "stun"),
    cast: (unit, ability) => {
      this.floatText(unit, ability, "cast");
      const ring = createRing(unitColor(unitDef(unit.defId)));
      const p = hexToWorld(unit.hex);
      ring.position.x = p.x;
      ring.position.z = p.z;
      this.scene.add(ring);
      const start = performance.now();
      this.effects.push({
        update: (now) => {
          const k = Math.min(1, (now - start) / 500);
          ring.scale.setScalar(1 + k * 1.6);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
          return k < 1;
        },
        dispose: () => {
          this.scene.remove(ring);
          ring.geometry.dispose();
          (ring.material as THREE.Material).dispose();
        },
      });
    },
    death: () => undefined,
  };

  private floatText(unit: ReplayUnit, text: string, cls: string): void {
    const v = this.views.get(`b:${unit.id}`);
    const p = v ? v.mesh.root.position : null;
    const w = p ?? (() => {
      const h = hexToWorld(unit.hex);
      return new THREE.Vector3(h.x, 0, h.z);
    })();
    const s = this.toScreen(w.x, (v?.mesh.height ?? 1.5) * 0.8, w.z);
    const el = document.createElement("div");
    el.className = `float-text ${cls}`;
    el.textContent = text;
    el.style.left = `${s.x + (Math.random() - 0.5) * 30}px`;
    el.style.top = `${s.y}px`;
    this.overlay.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  // ---------------------------------------------------------------- souris

  private setPointer(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private pickView(): View | null {
    const roots = [...this.views.values()].filter((v) => v.mesh.root.visible).map((v) => v.mesh.root);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.viewKey) o = o.parent;
    return o ? (this.views.get(o.userData.viewKey as string) ?? null) : null;
  }

  private groundPoint(): Point | null {
    const p = this.raycaster.ray.intersectPlane(this.ground, this.tmp);
    return p ? { x: p.x, z: p.z } : null;
  }

  /** Emplacement de l'unité du joueur sous le curseur (pour équiper un objet). */
  locationAt(clientX: number, clientY: number): Location | null {
    this.setPointer({ clientX, clientY } as PointerEvent);
    const v = this.pickView();
    if (v?.location && !v.enemy && !v.replay) return v.location;
    // À défaut, la case visée si une unité du joueur s'y trouve.
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
      this.drag.view.mesh.root.position.set(g.x, 0.6, g.z);
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
    if (this.highlighted) {
      const ud = this.highlighted.userData as { col?: number; row?: number };
      this.highlighted.material = ud.col !== undefined ? this.baseTileMaterial(ud.col, ud.row!) : this.benchMaterial;
      this.highlighted = null;
    }
    if (!location) return;
    const mesh = location.zone === "board" ? this.tiles[hexKey(location)] : this.benchSlots[location.index];
    if (!mesh) return;
    mesh.material = this.highlightMaterial;
    this.highlighted = mesh;
  }
}

function sameLocation(a: Location, b: Location): boolean {
  if (a.zone === "bench" && b.zone === "bench") return a.index === b.index;
  if (a.zone === "board" && b.zone === "board") return a.col === b.col && a.row === b.row;
  return false;
}

function unitRange(defId: string): number {
  return unitDef(defId)?.stats.range ?? 1;
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
