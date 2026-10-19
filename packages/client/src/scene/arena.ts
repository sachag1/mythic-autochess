// Arène réaliste : ciel HDRI (éclairage et fond), plateau hexagonal en marbre et granit
// (textures PBR Poly Haven) posé sur un socle de grès, dallage de l'arène, colonnes doriques,
// braseros enflammés et bannières aux couleurs du panthéon favori.
import * as THREE from "three/webgpu";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { BOARD_COLS, BOARD_ROWS, HALF_ROWS, hexKey } from "@autochess/sim";
import { BENCH_SIZE, BENCH_Z, benchToWorld, hexToWorld, HEX_SIZE } from "./layout";
import { positionLocal, positionWorld, sin, texture, time, uniform, vec2, vec3, type Node } from "./tsl";
import type { QualitySettings } from "./quality";
import { assets } from "./assets";
import type { VfxSystem } from "./vfx/VfxSystem";

const BASE = `${import.meta.env.BASE_URL}assets/`;
const texLoader = new THREE.TextureLoader();

interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  arm: THREE.Texture;
}

const pbrCache = new Map<string, PbrSet>();
function pbr(name: string, repeat = 1): PbrSet {
  const key = `${name}|${repeat}`;
  let set = pbrCache.get(key);
  if (!set) {
    const load = (kind: string, srgb: boolean) => {
      const t = texLoader.load(`${BASE}pbr/${name}_${kind}.webp`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    set = { map: load("diff", true), normalMap: load("nor", false), arm: load("arm", false) };
    pbrCache.set(key, set);
  }
  return set;
}

/** Matériau PBR standard (couleur, normales, AO-rugosité-métal). */
function pbrMaterial(name: string, repeat: number, o: { tint?: string; roughness?: number; normalScale?: number } = {}): THREE.MeshStandardMaterial {
  const t = pbr(name, repeat);
  const m = new THREE.MeshStandardMaterial({
    map: t.map,
    normalMap: t.normalMap,
    aoMap: t.arm,
    roughnessMap: t.arm,
    metalnessMap: t.arm,
    roughness: o.roughness ?? 1,
    metalness: 1,
    color: o.tint ?? "#ffffff",
  });
  m.normalScale.setScalar(o.normalScale ?? 1);
  return m;
}

/**
 * Matériau dont les coordonnées de texture viennent de la position dans le monde
 * (projection du dessus) : les cases et les sols n'ont pas de couture.
 */
function worldMaterial(name: string, scale: number, o: { tint?: string; roughness?: number } = {}): THREE.MeshStandardNodeMaterial {
  const t = pbr(name, 1);
  const uvw: Node = vec2(positionWorld.x, positionWorld.z).mul(scale);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: o.roughness ?? 1, metalness: 0 });
  const tint = new THREE.Color(o.tint ?? "#ffffff");
  m.colorNode = texture(t.map, uvw).rgb.mul(vec3(tint.r, tint.g, tint.b));
  m.roughnessNode = texture(t.arm, uvw).g.mul(o.roughness ?? 1);
  m.aoNode = texture(t.arm, uvw).r;
  return m;
}

/** Couleurs des bannières selon le panthéon favori (présage « Faveur du Panthéon »). */
const BANNER_COLORS: Record<string, [string, string]> = {
  greek: ["#2f5fb3", "#e3b23c"],
  norse: ["#2c4a7a", "#c0c8d0"],
  egyptian: ["#e6b43c", "#2348a8"],
  japanese: ["#c8322c", "#f4f1ea"],
  chinese: ["#c21f2a", "#e8b23a"],
  celtic: ["#2f7d3a", "#c0c8d0"],
  aztec: ["#1fa59a", "#e8c13a"],
  mesopotamian: ["#2347a0", "#e3b23c"],
};

export class Arena {
  readonly root = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly tiles: THREE.InstancedMesh[] = [];
  readonly benchSlots: THREE.Mesh[] = [];
  private readonly tileIndex = new Map<number, { mesh: THREE.InstancedMesh; i: number }>();
  private readonly baseColors = new Map<number, THREE.Color>();
  private readonly fires: { pos: THREE.Vector3; light: THREE.PointLight | null }[] = [];
  private readonly banners: THREE.Mesh[] = [];
  private readonly bannerColor = uniform(new THREE.Color("#2f5fb3"));
  private readonly bannerTrim = uniform(new THREE.Color("#e3b23c"));
  private highlighted: number | null = null;
  private benchHighlighted: THREE.Mesh | null = null;
  private readonly benchMaterial: THREE.MeshStandardMaterial;
  private readonly benchHighlightMaterial: THREE.MeshStandardMaterial;
  private fireClock = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private quality: QualitySettings,
  ) {
    scene.add(this.root);

    // ---------------------------------------------------------------- ciel et lumière
    new HDRLoader().load(`${BASE}sky/day.hdr`, (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = hdr;
      scene.environmentIntensity = 0.75;
    });
    texLoader.load(`${BASE}sky/day.webp`, (sky) => {
      sky.mapping = THREE.EquirectangularReflectionMapping;
      sky.colorSpace = THREE.SRGBColorSpace;
      scene.background = sky;
      scene.backgroundIntensity = 0.9;
    });
    scene.background = new THREE.Color("#9db8d8");
    scene.fog = new THREE.Fog("#c9d6e3", 45, 120);

    this.sun = new THREE.DirectionalLight("#fff1dc", 3.2);
    this.sun.position.set(-14, 26, 12);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    const cam = this.sun.shadow.camera;
    Object.assign(cam, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    scene.add(new THREE.HemisphereLight("#cfe2ff", "#8a7458", 0.35));

    this.buildBoard();
    this.buildBench();
    this.buildGrounds();
    this.buildColumns();
    this.buildBraziers();
    void assets.load("decor.glb").then((gltf) => this.placeDecor(gltf.scene)).catch(() => undefined);

    this.benchMaterial = this.benchSlots[0]!.material as THREE.MeshStandardMaterial;
    this.benchHighlightMaterial = this.benchMaterial.clone();
    this.benchHighlightMaterial.emissive = new THREE.Color("#4a86ff");
    this.benchHighlightMaterial.emissiveIntensity = 0.6;
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.mapSize.x !== q.shadowMapSize) {
      this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    for (const f of this.fires) if (f.light) f.light.visible = q.flashLights;
  }

  /** Couleurs des bannières selon le panthéon favori (ou grec par défaut). */
  setTheme(pantheon: string | null): void {
    const [a, b] = BANNER_COLORS[pantheon ?? ""] ?? BANNER_COLORS.greek!;
    this.bannerColor.value.set(a);
    this.bannerTrim.value.set(b);
  }

  // ---------------------------------------------------------------- plateau

  private buildBoard(): void {
    // Case : prisme hexagonal biseauté (extrusion d'un hexagone à pointe vers le haut).
    const shape = new THREE.Shape();
    const r = HEX_SIZE * 0.9;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.2, 0);

    const own = worldMaterial("marble", 0.22, { tint: "#f4efe6", roughness: 0.55 });
    const enemy = worldMaterial("granite", 0.25, { tint: "#b8b2aa", roughness: 0.8 });
    for (const [material, rows] of [[own, [0, HALF_ROWS]], [enemy, [HALF_ROWS, BOARD_ROWS]]] as const) {
      const count = (rows[1] - rows[0]) * BOARD_COLS;
      const mesh = new THREE.InstancedMesh(geo, material, count);
      mesh.receiveShadow = true;
      mesh.castShadow = this.quality.shadows;
      let i = 0;
      const m = new THREE.Matrix4();
      for (let row = rows[0]; row < rows[1]; row++) {
        for (let col = 0; col < BOARD_COLS; col++) {
          const p = hexToWorld({ col, row });
          m.makeTranslation(p.x, 0, p.z);
          mesh.setMatrixAt(i, m);
          const base = new THREE.Color("#ffffff").multiplyScalar(0.92 + ((col * 7 + row * 13) % 5) * 0.02);
          mesh.setColorAt(i, base);
          this.baseColors.set(hexKey({ col, row }), base);
          this.tileIndex.set(hexKey({ col, row }), { mesh, i });
          i++;
        }
      }
      mesh.instanceColor!.needsUpdate = true;
      this.tiles.push(mesh);
      this.root.add(mesh);
    }

    // Cadre du plateau : granit sombre serti d'un filet d'or, enchâssé dans l'estrade.
    const frame = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.5, 13.6), pbrMaterial("granite", 3, { tint: "#6a665f" }));
    frame.position.set(0, -0.42, 0);
    frame.receiveShadow = true;
    frame.castShadow = true;
    fixUv2(frame.geometry);
    this.root.add(frame);
    const gold = new THREE.MeshStandardMaterial({ color: "#c8973f", metalness: 1, roughness: 0.3 });
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.06, 12.8), gold);
    inlay.position.y = -0.2;
    inlay.receiveShadow = true;
    this.root.add(inlay);
    for (const [w, d, x, z] of [[15.4, 0.12, 0, 6.86], [15.4, 0.12, 0, -6.86], [0.12, 13.8, 7.66, 0], [0.12, 13.8, -7.66, 0]] as const) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), gold);
      rim.position.set(x, -0.15, z);
      this.root.add(rim);
    }
    // Ligne de séparation des deux moitiés : filet d'or.
    const line = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.04, 0.08), new THREE.MeshStandardMaterial({ color: "#e8c46a", metalness: 1, roughness: 0.25, emissive: "#6a4a10", emissiveIntensity: 0.4 }));
    line.position.set(0, 0.09, 0);
    this.root.add(line);

    // Estrade octogonale de grès (plateau et banc) et ses marches, comme un temple.
    const daisMat = pbrMaterial("sandstone", 5, { tint: "#ece0c6" });
    const octagon = (radius: number, height: number, y: number, mat: THREE.Material) => {
      const g = new THREE.CylinderGeometry(radius, radius + 0.08, height, 8, 1);
      g.rotateY(Math.PI / 8);
      fixUv2(g);
      const m = new THREE.Mesh(g, mat);
      m.position.set(0, y, 1.3);
      m.receiveShadow = true;
      m.castShadow = true;
      this.root.add(m);
      return m;
    };
    octagon(12.2, 0.9, -0.7, daisMat);
    const stepMat = pbrMaterial("sandstone", 6, { tint: "#e0d2b2" });
    for (let i = 0; i < 3; i++) octagon(12.9 + i * 0.75, 0.32, -1.04 - i * 0.3, stepMat);
    // Frise dorée au bord de l'estrade.
    const frieze = new THREE.Mesh(new THREE.TorusGeometry(12.15, 0.05, 6, 8), gold);
    frieze.rotation.set(Math.PI / 2, 0, Math.PI / 8);
    frieze.position.set(0, -0.26, 1.3);
    this.root.add(frieze);
  }

  private buildBench(): void {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.3, 2.2), pbrMaterial("granite", 2, { tint: "#6a665f" }));
    slab.position.set(0, -0.32, BENCH_Z);
    slab.receiveShadow = true;
    slab.castShadow = true;
    fixUv2(slab.geometry);
    this.root.add(slab);
    const slotMat = worldMaterial("granite", 0.4, { tint: "#8a8580", roughness: 0.7 }) as unknown as THREE.MeshStandardMaterial;
    const geo = new THREE.CylinderGeometry(0.7, 0.75, 0.16, 6);
    for (let i = 0; i < BENCH_SIZE; i++) {
      const slot = new THREE.Mesh(geo, slotMat);
      const p = benchToWorld(i);
      slot.position.set(p.x, -0.12, p.z);
      slot.receiveShadow = true;
      this.benchSlots.push(slot);
      this.root.add(slot);
    }
  }

  private buildGrounds(): void {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 72), worldMaterial("floor", 0.18, { tint: "#d8cfbf", roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.85;
    floor.receiveShadow = true;
    this.root.add(floor);
    const sand = new THREE.Mesh(new THREE.RingGeometry(29.5, 160, 72, 4), worldMaterial("sand", 0.08, { tint: "#e8d6b0" }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = -1.9;
    sand.receiveShadow = true;
    this.root.add(sand);
  }

  /** Colonnes doriques cannelées, certaines brisées, en arc derrière le plateau. */
  private buildColumns(): void {
    const marble = pbrMaterial("marble", 1, { tint: "#efe9df" });
    const shaft = new THREE.CylinderGeometry(0.55, 0.65, 1, 40, 8, false);
    const pos = shaft.attributes.position!;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const a = Math.atan2(v.z, v.x);
      const flute = 1 - 0.06 * Math.pow(Math.abs(Math.cos(a * 10)), 3);
      pos.setXYZ(i, v.x * flute, v.y, v.z * flute);
    }
    shaft.computeVertexNormals();
    fixUv2(shaft);
    const capital = new THREE.BoxGeometry(1.7, 0.35, 1.7);
    const echinus = new THREE.CylinderGeometry(0.85, 0.6, 0.35, 32);
    const base = new THREE.CylinderGeometry(0.85, 0.9, 0.3, 32);
    fixUv2(capital);
    const count = Math.round(14 * this.quality.scenery) + 4;
    for (let i = 0; i < count; i++) {
      const t = -Math.PI * 0.95 + (i / (count - 1)) * Math.PI * 0.9;
      const radius = 17 + (i % 2) * 1.5;
      const x = Math.cos(t) * radius * 1.15;
      const z = Math.sin(t) * radius - 2;
      const broken = i % 5 === 2;
      const height = broken ? 2.5 + (i % 3) : 8;
      const col = new THREE.Group();
      const s = new THREE.Mesh(shaft, marble);
      s.scale.y = height;
      s.position.y = height / 2 + 0.3;
      const foot = new THREE.Mesh(base, marble);
      foot.position.y = 0.15;
      col.add(s, foot);
      if (!broken) {
        const e = new THREE.Mesh(echinus, marble);
        e.position.y = height + 0.45;
        const c = new THREE.Mesh(capital, marble);
        c.position.y = height + 0.8;
        col.add(e, c);
      } else {
        s.rotation.z = (i % 2 ? 1 : -1) * 0.04;
      }
      col.position.set(x, -1.85, z);
      col.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      this.root.add(col);
      if (!broken && i % 3 === 0 && i < count - 1) this.addBanner(x, z);
    }
  }

  /** Bannière de tissu qui ondule (shader de vent). */
  private addBanner(x: number, z: number): void {
    const geo = new THREE.PlaneGeometry(1.3, 4, 6, 16);
    const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.9 });
    const v = positionLocal.y.mul(-1).add(2).div(4);
    const wave = sin(time.mul(2.2).add(positionLocal.y.mul(1.6)).add(x)).mul(v).mul(0.18);
    mat.positionNode = positionLocal.add(vec3(0, 0, wave));
    const trim = positionLocal.x.abs().greaterThan(0.5).or(positionLocal.y.lessThan(-1.75));
    mat.colorNode = trim.select(vec3(this.bannerTrim), vec3(this.bannerColor));
    const banner = new THREE.Mesh(geo, mat);
    banner.position.set(x * 0.94, 4.6, z * 0.94);
    banner.lookAt(0, 4.6, 0);
    banner.castShadow = true;
    this.banners.push(banner);
    this.root.add(banner);
  }

  /** Décor réaliste Poly Haven : rochers dans le sable, statues et vases autour de l'estrade. */
  private placeDecor(decor: THREE.Object3D): void {
    const place = (name: string, x: number, z: number, scale: number, rotY = 0, y = -1.9) => {
      const src = decor.children.find((c) => c.name === name);
      if (!src) return;
      const o = src.clone(true);
      o.position.set(x, y, z);
      o.scale.setScalar(scale);
      o.rotation.y = rotY;
      o.traverse((m) => {
        m.castShadow = true;
        m.receiveShadow = true;
      });
      this.root.add(o);
    };
    const n = this.quality.scenery;
    // Statues de part et d'autre, derrière le plateau.
    place("gothic_statue", -14.5, -7, 1.6, 0.5, -1.85);
    place("gothic_statue", 14.5, -7, 1.6, -0.5, -1.85);
    place("horse_statue_01", 0, -24, 3.2, 0, -1.9);
    // Vases près des braseros.
    place("antique_ceramic_vase_01", -10.4, -7.4, 1.1, 0.3, -1.85);
    place("ceramic_vase_02", 10.6, -7.6, 1.1, 1.2, -1.85);
    place("brass_vase_01", -10.8, 6.2, 1, 0.7, -1.85);
    // Rochers dans le sable, au-delà du dallage.
    const rocks = ["boulder_01", "namaqualand_boulder_02", "namaqualand_boulder_04", "rock_moss_set_01"];
    const count = Math.round(16 * n);
    for (let i = 0; i < count; i++) {
      const a = -Math.PI * 1.05 + (i / count) * Math.PI * 1.1 + Math.sin(i * 7.3) * 0.08;
      const r = 33 + Math.abs(Math.sin(i * 3.1)) * 12;
      place(rocks[i % rocks.length]!, Math.cos(a) * r * 1.2, Math.sin(a) * r - 4, 2.2 + Math.abs(Math.sin(i * 5.7)) * 2.5, i * 1.3, -2.2);
    }
  }

  private buildBraziers(): void {
    const bronze = new THREE.MeshStandardMaterial({ color: "#8a5a2a", metalness: 1, roughness: 0.35 });
    const stone = pbrMaterial("sandstone", 1, { tint: "#e0d2b2" });
    const bowl = new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const pedestal = new THREE.CylinderGeometry(0.3, 0.45, 1.4, 16);
    for (const [x, z] of [[-9.4, -6.4], [9.4, -6.4], [-9.6, 6.8], [9.6, 6.8]] as const) {
      const g = new THREE.Group();
      const p = new THREE.Mesh(pedestal, stone);
      p.position.y = 0.7;
      const b = new THREE.Mesh(bowl, bronze);
      b.position.y = 1.55;
      g.add(p, b);
      g.position.set(x, -0.25, z);
      g.traverse((o) => (o.castShadow = true));
      this.root.add(g);
      const fire = new THREE.Vector3(x, -0.25 + 1.65, z);
      let light: THREE.PointLight | null = null;
      if (this.fires.length < 2) {
        light = new THREE.PointLight("#ff8a3a", 6, 9, 1.8);
        light.position.copy(fire).add(new THREE.Vector3(0, 0.6, 0));
        light.visible = this.quality.flashLights;
        this.root.add(light);
      }
      this.fires.push({ pos: fire, light });
    }
  }

  /** Flammes des braseros (particules) et scintillement des lumières. */
  update(dt: number, vfx: VfxSystem): void {
    this.fireClock += dt * (this.quality.level === "low" ? 18 : 40);
    const flame = new THREE.Color("#ff7a22");
    const ember = new THREE.Color("#ffc46a");
    while (this.fireClock > 1) {
      this.fireClock -= 1;
      for (const f of this.fires) {
        vfx.particle({ x: f.pos.x + (Math.random() - 0.5) * 0.5, y: f.pos.y, z: f.pos.z + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 0.2, vy: 1.4 + Math.random(), vz: (Math.random() - 0.5) * 0.2, life: 0.55, size: 0.45, endSize: 0.15, color: flame, intensity: 3, drag: 1.5 });
        if (Math.random() < 0.3) vfx.particle({ x: f.pos.x, y: f.pos.y + 0.3, z: f.pos.z, vx: (Math.random() - 0.5) * 0.6, vy: 2 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.6, life: 1.4, size: 0.05, color: ember, intensity: 4, drag: 0.6 });
        if (Math.random() < 0.15) vfx.particle({ x: f.pos.x, y: f.pos.y + 0.8, z: f.pos.z, vy: 1, life: 2.2, size: 0.5, endSize: 3, color: new THREE.Color("#4a4440"), drag: 0.8 }, true);
      }
    }
    const t = performance.now() / 1000;
    for (const [i, f] of this.fires.entries()) if (f.light) f.light.intensity = 5 + Math.sin(t * 13 + i) * 0.8 + Math.sin(t * 7.3 + i * 2) * 0.6;
  }

  // ---------------------------------------------------------------- surbrillance (glisser-déposer)

  highlightHex(col: number | null, row = 0): void {
    if (this.highlighted !== null) this.setTileColor(this.highlighted, this.baseColors.get(this.highlighted)!);
    this.highlighted = null;
    if (col === null) return;
    const key = hexKey({ col, row });
    this.setTileColor(key, new THREE.Color("#7fb0ff").multiplyScalar(1.35));
    this.highlighted = key;
  }

  highlightBench(index: number | null): void {
    if (this.benchHighlighted) this.benchHighlighted.material = this.benchMaterial;
    this.benchHighlighted = index === null ? null : (this.benchSlots[index] ?? null);
    if (this.benchHighlighted) this.benchHighlighted.material = this.benchHighlightMaterial;
  }

  private setTileColor(key: number, c: THREE.Color): void {
    const t = this.tileIndex.get(key);
    if (!t) return;
    t.mesh.setColorAt(t.i, c);
    t.mesh.instanceColor!.needsUpdate = true;
  }
}

/** Les cartes d'occlusion utilisent le second jeu de coordonnées : on le copie du premier. */
function fixUv2(g: THREE.BufferGeometry): void {
  if (g.attributes.uv && !g.attributes.uv1) g.setAttribute("uv1", g.attributes.uv);
}
