// Accessoires modélisés en code pour rendre chaque personnage reconnaissable : couronnes,
// cornes, oreilles, museaux, ailes, queues, coiffes… Les cotes sont exprimées dans l'espace
// de l'os « head » des personnages KayKit (tête : y de 0 à 1,07, demi-largeur 0,54, visage
// vers +z à 0,53) ou de l'os « chest » pour le dos (dos vers −z à 0,4). Une instance peut
// être déplacée, tournée et mise à l'échelle (animaux).
import * as THREE from "three/webgpu";
import { featherTexture, withSurface, type Surface } from "./surfaces";

export interface AccessoryDef {
  kind: AccessoryKind;
  /** Os de rattachement (par défaut selon le type d'accessoire). */
  bone?: string;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: number;
  color?: string;
  color2?: string;
}

const materials = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, o: { metal?: number; rough?: number; glow?: number; opacity?: number; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.metal ?? 0}|${o.rough ?? 0.6}|${o.glow ?? 0}|${o.opacity ?? 1}|${o.side ?? 0}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, metalness: o.metal ?? 0, roughness: o.rough ?? 0.6, side: o.side ?? THREE.FrontSide });
    if (o.glow) {
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = o.glow;
    }
    if (o.opacity !== undefined && o.opacity < 1) {
      m.transparent = true;
      m.opacity = o.opacity;
      m.depthWrite = false;
    }
    materials.set(key, m);
  }
  return m;
}

const GOLD = (c = "#e8b84a") => mat(c, { metal: 0.9, rough: 0.3 });
const IVORY = mat("#efe6cf", { rough: 0.5 });

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (children.length) g.add(...children);
  return g;
}

/** Corne courbe : tube conique le long d'une courbe. */
function horn(points: [number, number, number][], radius: number, m: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, 16, radius, 8, false);
  // Effile le tube vers la pointe.
  const pos = g.attributes.position!;
  const tmp = new THREE.Vector3();
  const seg = 17;
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / 9);
    const k = ring / (seg - 1);
    const c = curve.getPoint(Math.min(1, k));
    tmp.fromBufferAttribute(pos, i).sub(c).multiplyScalar(1 - k * 0.92).add(c);
    pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  g.computeVertexNormals();
  return mesh(g, m);
}

function mirrorPair(make: (side: 1 | -1) => THREE.Object3D): THREE.Group {
  return group(make(1), make(-1));
}

/** Plume : plan texturé (rachis et barbes, bords transparents), légèrement incurvé. */
function feather(length: number, width: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.PlaneGeometry(width * 2.6, length * 2, 2, 6);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, -Math.pow(pos.getX(i) / (width * 1.3), 2) * width * 0.25);
  g.computeVertexNormals();
  g.translate(0, length, 0);
  return mesh(g, featherMaterial(m as THREE.MeshStandardMaterial));
}

const featherMats = new Map<string, THREE.MeshStandardMaterial>();
function featherMaterial(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const key = base.color.getHexString();
  let m = featherMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: base.color, map: featherTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
    featherMats.set(key, m);
  }
  return m;
}

/** Aile de plumes : rangées de plumes en éventail, de la verticale vers l'horizontale, côté `side` (+x ou −x). */
function wing(side: 1 | -1, c1: string, c2: string, span = 0.95): THREE.Group {
  const w = new THREE.Group();
  const m1 = mat(c1, { rough: 0.7, side: THREE.DoubleSide });
  const m2 = mat(c2, { rough: 0.7, side: THREE.DoubleSide });
  const rows: [number, number, THREE.Material][] = [[span, 0.12, m1], [span * 0.72, 0.11, m2], [span * 0.48, 0.1, m1]];
  rows.forEach(([len, wid, m], r) => {
    const count = 7 - r;
    for (let i = 0; i < count; i++) {
      const k = i / (count - 1);
      const f = feather(len * (0.6 + 0.4 * (1 - Math.abs(k - 0.35))), wid, m);
      // Rotation autour de z : 0 = vers le haut, π/2 = vers l'extérieur.
      f.rotation.z = -side * (0.25 + k * 1.35);
      f.position.z = -r * 0.03;
      w.add(f);
    }
  });
  w.userData.flap = side;
  return w;
}

function batWing(side: 1 | -1, c: string, span = 1.2): THREE.Group {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(span * 0.4, span * 0.45);
  shape.lineTo(span, span * 0.35);
  shape.quadraticCurveTo(span * 0.8, 0.05, span * 0.85, -0.2);
  shape.quadraticCurveTo(span * 0.55, -0.05, span * 0.5, -0.32);
  shape.quadraticCurveTo(span * 0.3, -0.1, 0, -0.25);
  const g = new THREE.ShapeGeometry(shape);
  if (side < 0) g.scale(-1, 1, 1);
  const w = group(mesh(g, mat(c, { rough: 0.8, side: THREE.DoubleSide })));
  w.userData.flap = side;
  return w;
}

export type AccessoryKind =
  | "crown" | "laurel" | "halo" | "sunDisc" | "hornsBull" | "hornsRam" | "hornsDemon" | "antlers"
  | "earsCat" | "earsJackal" | "earsSet" | "earsPig" | "earsRound" | "snoutCroc" | "snoutJackal" | "snoutPig"
  | "snoutLong" | "beak" | "eyeBig" | "thirdEye" | "nemes" | "featherHeaddress" | "plumeCrest" | "wingedHelm"
  | "kabuto" | "circlet" | "qingHat" | "lionMane" | "snakeHair" | "veil" | "beard" | "starCrown" | "hornedCap"
  | "goggles" | "facePaint" | "plate" | "furHood" | "jaguarHelm" | "hairBun"
  | "wingsFeather" | "wingsRaven" | "wingsBat" | "shell" | "drumRing" | "tails" | "scorpionTail" | "monkeyTail"
  | "fireWheels" | "mirror" | "necklace" | "cauldron"
  | "thunderbolt" | "flameTip" | "trident";

/** Os par défaut de chaque accessoire. */
const DEFAULT_BONE: Partial<Record<AccessoryKind, string>> = {
  wingsFeather: "chest", wingsRaven: "chest", wingsBat: "chest", shell: "chest", drumRing: "chest", necklace: "chest", mirror: "chest", cauldron: "chest",
  tails: "hips", scorpionTail: "hips", monkeyTail: "hips", fireWheels: "root",
  thunderbolt: "handslot.l", flameTip: "handslot.r", trident: "handslot.r",
};

export function boneFor(a: AccessoryDef): string {
  return a.bone ?? DEFAULT_BONE[a.kind] ?? "head";
}

export function buildAccessory(a: AccessoryDef): THREE.Object3D {
  const c = a.color;
  const c2 = a.color2;
  let o: THREE.Object3D;
  switch (a.kind) {
    case "crown": {
      const gold = GOLD(c);
      const ring = mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.16, 24, 1, true), mat(c ?? "#e8b84a", { metal: 0.9, rough: 0.3, side: THREE.DoubleSide }), 0, 0.98, 0);
      const g = group(ring);
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        g.add(mesh(new THREE.ConeGeometry(0.06, 0.2, 4), gold, Math.sin(t) * 0.43, 1.14, Math.cos(t) * 0.43));
        if (i % 2 === 0) g.add(mesh(new THREE.OctahedronGeometry(0.045), mat(c2 ?? "#d13b3b", { metal: 0.3, rough: 0.2, glow: 0.3 }), Math.sin(t) * 0.455, 0.98, Math.cos(t) * 0.455));
      }
      o = g;
      break;
    }
    case "laurel": {
      const leaf = mat(c ?? "#5c9a3c", { rough: 0.5, metal: c ? 0.8 : 0 });
      const g = group();
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 7; i++) {
          const t = side * (0.35 + i * 0.32);
          const l = mesh(new THREE.SphereGeometry(0.08, 6, 4), leaf, Math.sin(t) * 0.5, 0.82 + i * 0.012, Math.cos(t) * 0.5);
          l.scale.set(0.6, 0.35, 1.3);
          l.rotation.y = t + side * 0.6;
          g.add(l);
        }
      }
      o = g;
      break;
    }
    case "halo":
      o = mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 40), mat(c ?? "#ffd76a", { glow: 2.5 }), 0, 1.38, -0.05);
      o.rotation.x = Math.PI / 2 - 0.25;
      break;
    case "sunDisc": {
      const disc = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 32), mat(c ?? "#ff9a2e", { glow: 2.2, rough: 0.3 }), 0, 1.45, -0.25);
      disc.rotation.x = Math.PI / 2;
      const cobra = horn([[0, 0.95, 0.38], [0, 1.15, 0.5], [0, 1.25, 0.45]], 0.06, GOLD());
      const horns = mirrorPair((s) => horn([[s * 0.2, 1.0, -0.2], [s * 0.55, 1.25, -0.22], [s * 0.45, 1.75, -0.25]], 0.05, mat("#3a2a1a")));
      o = group(disc, cobra, horns);
      break;
    }
    case "hornsBull":
      o = mirrorPair((s) => horn([[s * 0.42, 0.8, 0], [s * 0.78, 0.92, 0.05], [s * 0.86, 1.25, 0.12], [s * 0.72, 1.45, 0.18]], 0.11, mat(c ?? "#efe6cf", { rough: 0.45 })));
      break;
    case "hornsRam":
      o = mirrorPair((s) => horn([[s * 0.35, 0.95, -0.1], [s * 0.62, 1.0, -0.15], [s * 0.72, 0.75, -0.05], [s * 0.6, 0.55, 0.12], [s * 0.5, 0.65, 0.2]], 0.09, mat(c ?? "#a08a6a", { rough: 0.5 })));
      break;
    case "hornsDemon":
      o = mirrorPair((s) => horn([[s * 0.25, 1.0, 0.1], [s * 0.32, 1.22, 0.12], [s * 0.3, 1.45, 0.05]], 0.08, mat(c ?? "#f2ead5", { rough: 0.4 })));
      break;
    case "antlers": {
      const m = mat(c ?? "#7a5a3a", { rough: 0.8 });
      o = mirrorPair((s) =>
        group(
          horn([[s * 0.3, 1.0, 0], [s * 0.5, 1.35, -0.05], [s * 0.7, 1.75, -0.1], [s * 0.75, 2.05, -0.12]], 0.06, m),
          horn([[s * 0.48, 1.3, -0.05], [s * 0.8, 1.45, 0], [s * 0.95, 1.55, 0.02]], 0.04, m),
          horn([[s * 0.65, 1.65, -0.1], [s * 0.95, 1.85, -0.1], [s * 1.05, 2.0, -0.08]], 0.035, m),
          horn([[s * 0.6, 1.55, -0.08], [s * 0.55, 1.85, 0.05], [s * 0.5, 2.0, 0.1]], 0.03, m),
        ),
      );
      break;
    }
    case "earsCat":
      o = mirrorPair((s) => {
        const e = mesh(new THREE.ConeGeometry(0.16, 0.38, 4), mat(c ?? "#2a2422"), s * 0.32, 1.1, -0.02);
        e.rotation.set(0, Math.PI / 4, -s * 0.25);
        return e;
      });
      break;
    case "earsJackal":
      o = mirrorPair((s) => {
        const e = mesh(new THREE.ConeGeometry(0.12, 0.65, 4), mat(c ?? "#1b1a1f"), s * 0.25, 1.3, -0.05);
        e.rotation.set(0, Math.PI / 4, -s * 0.12);
        e.scale.set(1, 1, 0.5);
        return e;
      });
      break;
    case "earsSet":
      o = mirrorPair((s) => {
        const e = mesh(new THREE.BoxGeometry(0.12, 0.6, 0.06), mat(c ?? "#8a2f24"), s * 0.22, 1.3, -0.05);
        e.rotation.z = -s * 0.1;
        const tip = mesh(new THREE.BoxGeometry(0.22, 0.08, 0.06), mat(c ?? "#8a2f24"), s * 0.25, 1.6, -0.05);
        return group(e, tip);
      });
      break;
    case "earsPig":
      o = mirrorPair((s) => {
        const e = mesh(new THREE.ConeGeometry(0.17, 0.3, 3), mat(c ?? "#e89aa0"), s * 0.45, 0.95, 0.05);
        e.rotation.set(0.6, 0, -s * 1.1);
        return e;
      });
      break;
    case "earsRound":
      o = mirrorPair((s) => {
        const e = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16), mat(c ?? "#8a5a3a"), s * 0.58, 0.6, 0);
        e.rotation.z = Math.PI / 2;
        return e;
      });
      break;
    case "snoutCroc": {
      const m = mat(c ?? "#4f7a3a", { rough: 0.7 });
      const jaw = mesh(new THREE.BoxGeometry(0.42, 0.18, 0.75), m, 0, 0.32, 0.75);
      const top = mesh(new THREE.BoxGeometry(0.46, 0.2, 0.8), m, 0, 0.5, 0.78);
      const teeth = group();
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
        const t = mesh(new THREE.ConeGeometry(0.025, 0.08, 4), IVORY, s * 0.2, 0.4, 0.45 + i * 0.12);
        t.rotation.x = Math.PI;
        teeth.add(t);
      }
      const eyes = mirrorPair((s) => mesh(new THREE.SphereGeometry(0.07, 8, 6), mat("#ffd23a", { glow: 0.6 }), s * 0.2, 0.65, 0.45));
      o = group(jaw, top, teeth, eyes);
      break;
    }
    case "snoutJackal": {
      const g = new THREE.ConeGeometry(0.2, 0.6, 6);
      g.rotateX(Math.PI / 2);
      o = group(mesh(g, mat(c ?? "#1b1a1f"), 0, 0.42, 0.75), mesh(new THREE.SphereGeometry(0.05, 6, 4), mat("#000000"), 0, 0.45, 1.05));
      break;
    }
    case "snoutPig": {
      const s = mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.2, 16), mat(c ?? "#f0a6ae"), 0, 0.42, 0.6);
      s.rotation.x = Math.PI / 2;
      const nostrils = mirrorPair((k) => mesh(new THREE.SphereGeometry(0.04, 6, 4), mat("#5a2a30"), k * 0.07, 0.42, 0.7));
      o = group(s, nostrils);
      break;
    }
    case "snoutLong": {
      const g = new THREE.ConeGeometry(0.1, 0.65, 8);
      g.rotateX(Math.PI / 2);
      o = mesh(g, mat(c ?? "#c8322c"), 0, 0.55, 0.85);
      break;
    }
    case "beak": {
      const g = new THREE.ConeGeometry(0.16, 0.45, 6);
      g.rotateX(Math.PI / 2 + 0.35);
      o = mesh(g, mat(c ?? "#e8a63a", { rough: 0.4 }), 0, 0.45, 0.7);
      break;
    }
    case "eyeBig": {
      const white = mesh(new THREE.SphereGeometry(0.27, 16, 12), mat("#f4f1ea", { rough: 0.2 }), 0, 0.58, 0.42);
      const iris = mesh(new THREE.SphereGeometry(0.13, 12, 8), mat(c ?? "#c43a2a", { glow: 0.8 }), 0, 0.58, 0.64);
      const pupil = mesh(new THREE.SphereGeometry(0.06, 8, 6), mat("#050505"), 0, 0.58, 0.74);
      o = group(white, iris, pupil);
      break;
    }
    case "thirdEye": {
      const e = mesh(new THREE.SphereGeometry(0.09, 12, 8), mat(c ?? "#ffcf4a", { glow: 2.5 }), 0, 0.8, 0.5);
      e.scale.set(0.6, 1.2, 0.5);
      o = e;
      break;
    }
    case "nemes": {
      const a1 = mat(c ?? "#2f5fb3", { rough: 0.5 });
      const a2 = GOLD(c2);
      const shell = mesh(new THREE.SphereGeometry(0.6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), a1, 0, 0.55, -0.03);
      shell.scale.set(1, 0.95, 1);
      const g = group(shell);
      for (let i = 0; i < 5; i++) {
        const band = mesh(new THREE.TorusGeometry(0.6 - i * 0.02, 0.022, 4, 24, Math.PI), a2, 0, 0.62 + i * 0.1, -0.03);
        band.rotation.y = Math.PI / 2;
        g.add(band);
      }
      for (const s of [-1, 1]) {
        const flap = mesh(new THREE.BoxGeometry(0.22, 0.75, 0.08), a1, s * 0.5, 0.2, 0.2);
        flap.rotation.z = s * 0.1;
        g.add(flap);
        for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.23, 0.04, 0.09), a2, s * 0.5, -0.05 + i * 0.18, 0.2));
      }
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 8), a2, 0, 1.05, 0.42));
      o = g;
      break;
    }
    case "featherHeaddress": {
      const colors = [c ?? "#1fa58a", c2 ?? "#e8c13a", "#d6403a"];
      const g = group(mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 24), GOLD(), 0, 0.75, 0));
      (g.children[0] as THREE.Mesh).rotation.x = Math.PI / 2;
      for (let i = 0; i < 11; i++) {
        const t = -1.2 + (i / 10) * 2.4;
        const f = feather(0.7 + (1 - Math.abs(t) / 1.2) * 0.35, 0.11, mat(colors[i % 3]!, { rough: 0.6 }));
        f.position.set(Math.sin(t) * 0.45, 0.85, -0.25 + Math.cos(t) * 0.05);
        f.rotation.set(-0.35, 0, -t * 0.8);
        g.add(f);
      }
      o = g;
      break;
    }
    case "plumeCrest": {
      // Crinière de casque grec : demi-disque d'avant en arrière, avec un support doré.
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 0.5, 0, Math.PI, false);
      shape.lineTo(0.5, 0);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
      g.translate(0, 0, -0.06);
      g.rotateY(Math.PI / 2);
      const crest = mesh(g, mat(c ?? "#c4262e", { rough: 0.9 }), 0, 0.95, -0.05);
      crest.scale.set(1, 0.8, 1);
      const holder = mesh(new THREE.TorusGeometry(0.5, 0.03, 4, 20, Math.PI), GOLD(), 0, 0.95, -0.05);
      holder.rotation.y = Math.PI / 2;
      holder.scale.set(1, 0.8, 1);
      o = group(crest, holder);
      break;
    }
    case "wingedHelm": {
      const metal = mat(c ?? "#b9c2c9", { metal: 0.85, rough: 0.3 });
      const cap = mesh(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), metal, 0, 0.6, 0);
      const nose = mesh(new THREE.BoxGeometry(0.07, 0.35, 0.06), metal, 0, 0.55, 0.58);
      const wings = mirrorPair((s) => {
        const w = wing(s, "#ffffff", "#dfe6ee", 0.45);
        w.position.set(s * 0.56, 0.75, -0.05);
        w.rotation.set(0, s * 0.5, 0);
        w.userData.flap = undefined;
        return w;
      });
      o = group(cap, nose, wings);
      break;
    }
    case "kabuto": {
      const dark = mat(c ?? "#23262e", { metal: 0.6, rough: 0.35 });
      const cap = mesh(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), dark, 0, 0.62, 0);
      const brim = mesh(new THREE.CylinderGeometry(0.72, 0.78, 0.08, 20), dark, 0, 0.6, -0.05);
      const crest = mirrorPair((s) => {
        const b = mesh(new THREE.BoxGeometry(0.08, 0.7, 0.04), GOLD(c2), s * 0.2, 1.25, 0.5);
        b.rotation.z = -s * 0.45;
        return b;
      });
      o = group(cap, brim, crest);
      break;
    }
    case "circlet": {
      const ring = mesh(new THREE.TorusGeometry(0.52, 0.035, 6, 32), GOLD(c), 0, 0.72, 0.02);
      ring.rotation.x = Math.PI / 2 + 0.12;
      const curls = mirrorPair((s) => {
        const t = mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), GOLD(c), s * 0.12, 0.82, 0.52);
        return t;
      });
      o = group(ring, curls);
      break;
    }
    case "qingHat": {
      const black = mat("#1c1c22", { rough: 0.7 });
      const brim = mesh(new THREE.CylinderGeometry(0.6, 0.62, 0.08, 24), black, 0, 1.0, 0);
      const top = mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.25, 20), mat(c ?? "#8a1f2a"), 0, 1.15, 0);
      const knob = mesh(new THREE.SphereGeometry(0.08, 8, 6), mat("#d13b3b", { glow: 0.3 }), 0, 1.33, 0);
      const talisman = mesh(new THREE.PlaneGeometry(0.22, 0.6), mat("#f2d24a", { side: THREE.DoubleSide, glow: 0.2 }), 0, 0.62, 0.56);
      const ink = mesh(new THREE.PlaneGeometry(0.05, 0.45), mat("#a3171d", { side: THREE.DoubleSide }), 0, 0.62, 0.565);
      o = group(brim, top, knob, talisman, ink);
      break;
    }
    case "lionMane": {
      const m = mat(c ?? "#c47a2a", { rough: 0.9 });
      const g = group();
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        const spike = mesh(new THREE.ConeGeometry(0.13, 0.42, 5), m, Math.sin(t) * 0.55, 0.55 + Math.cos(t) * 0.5, -0.12);
        spike.rotation.z = -t;
        g.add(spike);
      }
      g.add(...mirrorPair((s) => mesh(new THREE.SphereGeometry(0.12, 8, 6), m, s * 0.4, 1.05, 0)).children);
      o = g;
      break;
    }
    case "snakeHair": {
      const m = mat(c ?? "#4f8f3a", { rough: 0.6 });
      const g = group();
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2;
        const r = 0.48;
        const x = Math.sin(t) * r;
        const z = Math.cos(t) * r * 0.9 - 0.05;
        if (z > 0.3 && Math.abs(x) < 0.2) continue;
        g.add(horn([[x * 0.8, 0.95, z * 0.8], [x * 1.25, 1.15, z * 1.2], [x * 1.45, 1.0 + (i % 3) * 0.1, z * 1.45]], 0.06, m));
        g.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), m, x * 1.45, 1.0 + (i % 3) * 0.1, z * 1.45));
      }
      o = g;
      break;
    }
    case "veil": {
      const g = new THREE.PlaneGeometry(1.2, 1.8, 6, 8);
      const pos = g.attributes.position!;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.cos(pos.getX(i) * 2.2) * 0.25 - 0.05 * pos.getY(i));
      g.computeVertexNormals();
      o = mesh(g, mat(c ?? "#e8f0ff", { opacity: 0.55, side: THREE.DoubleSide, glow: 0.4 }), 0, 0.4, -0.45);
      break;
    }
    case "beard": {
      const g = new THREE.ConeGeometry(0.32, 0.6, 10);
      g.rotateX(Math.PI);
      const b = mesh(g, mat(c ?? "#f2f2f2", { rough: 0.9 }), 0, -0.02, 0.42);
      b.scale.set(1.1, 1, 0.6);
      const mustache = mirrorPair((s) => {
        const m = mesh(new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), mat(c ?? "#f2f2f2", { rough: 0.9 }), s * 0.12, 0.24, 0.53);
        m.rotation.z = s * 1.2;
        return m;
      });
      o = group(b, mustache);
      break;
    }
    case "starCrown": {
      const shape = new THREE.Shape();
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? 0.4 : 0.16;
        const t = (i / 16) * Math.PI * 2;
        if (i === 0) shape.moveTo(Math.sin(t) * r, Math.cos(t) * r);
        else shape.lineTo(Math.sin(t) * r, Math.cos(t) * r);
      }
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
      o = group(mesh(g, mat(c ?? "#ffe08a", { glow: 2.2, metal: 0.6 }), 0, 1.45, -0.05), mesh(new THREE.TorusGeometry(0.46, 0.03, 6, 24), GOLD(), 0, 0.9, 0));
      (o.children[1] as THREE.Mesh).rotation.x = Math.PI / 2;
      break;
    }
    case "hornedCap": {
      const cap = mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.55, 20), mat(c ?? "#2b4fa8", { rough: 0.5 }), 0, 1.15, 0);
      const g = group(cap);
      for (let i = 0; i < 3; i++) {
        const band = mesh(new THREE.TorusGeometry(0.46 - i * 0.03, 0.035, 6, 24), GOLD(c2), 0, 0.98 + i * 0.16, 0);
        band.rotation.x = Math.PI / 2;
        g.add(band);
        g.add(...mirrorPair((s) => horn([[s * 0.3, 0.98 + i * 0.16, 0.3], [s * 0.15, 1.04 + i * 0.16, 0.45], [s * 0.02, 1.08 + i * 0.16, 0.48]], 0.03, GOLD(c2))).children);
      }
      g.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), GOLD(c2), 0, 1.47, 0));
      o = g;
      break;
    }
    case "goggles": {
      const m = mat(c ?? "#2a9fd6", { rough: 0.4, glow: 0.3 });
      const rings = mirrorPair((s) => mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 16), m, s * 0.2, 0.55, 0.53));
      const fangs = mirrorPair((s) => {
        const f = mesh(new THREE.ConeGeometry(0.04, 0.18, 4), IVORY, s * 0.08, 0.2, 0.52);
        f.rotation.x = Math.PI;
        return f;
      });
      o = group(rings, fangs);
      break;
    }
    case "facePaint": {
      const band = mesh(new THREE.BoxGeometry(1.1, 0.2, 0.04), mat(c ?? "#111114"), 0, 0.56, 0.5);
      const g = group(band);
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(1.12, 0.035, 0.045), mat(c2 ?? "#e8c13a", { glow: 0.3 }), 0, 0.44 - i * 0.09, 0.5));
      o = g;
      break;
    }
    case "plate": {
      const rim = mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.08, 20), mat("#3f7d5a"), 0, 1.08, 0);
      const water = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 20), mat("#7fd6ff", { glow: 0.6, rough: 0.1 }), 0, 1.12, 0);
      o = group(rim, water);
      break;
    }
    case "furHood": {
      const t = mesh(new THREE.TorusGeometry(0.55, 0.16, 8, 20), mat(c ?? "#f2f4f7", { rough: 1 }), 0, 0.28, 0.05);
      t.rotation.x = Math.PI / 2 + 0.2;
      o = t;
      break;
    }
    case "jaguarHelm": {
      const fur = mat(c ?? "#e3a93a", { rough: 0.9 });
      const cap = mesh(new THREE.SphereGeometry(0.62, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), fur, 0, 0.55, -0.02);
      const g = group(cap);
      for (let i = 0; i < 14; i++) {
        const t = (i / 14) * Math.PI * 2;
        const ph = 0.3 + (i % 3) * 0.35;
        g.add(mesh(new THREE.SphereGeometry(0.06, 6, 4), mat("#1d1712"), Math.sin(t) * Math.sin(ph) * 0.62, 0.55 + Math.cos(ph) * 0.62, Math.cos(t) * Math.sin(ph) * 0.62 - 0.02));
      }
      const jaw = mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 16, Math.PI), IVORY, 0, 0.68, 0.32);
      jaw.rotation.set(Math.PI / 2 - 0.4, 0, 0);
      g.add(jaw, ...buildAccessory({ kind: "earsCat", color: c ?? "#e3a93a" }).children);
      o = g;
      break;
    }
    case "hairBun": {
      o = group(mesh(new THREE.SphereGeometry(0.22, 12, 8), mat(c ?? "#1a1414", { rough: 0.8 }), 0, 0.98, -0.38), mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), GOLD(), 0, 1.02, -0.38));
      (o.children[1] as THREE.Mesh).rotation.z = Math.PI / 2;
      break;
    }
    // ------------------------------------------------------------ dos et corps
    case "wingsFeather":
    case "wingsRaven": {
      const raven = a.kind === "wingsRaven";
      const w1 = c ?? (raven ? "#16151c" : "#f4f1ea");
      const w2 = c2 ?? (raven ? "#2b2840" : "#d9cfa8");
      o = mirrorPair((s) => {
        const w = wing(s, w1, w2, raven ? 1.05 : 0.95);
        w.position.set(s * 0.12, 0.2, -0.38);
        w.rotation.y = s * 0.45;
        return w;
      });
      break;
    }
    case "wingsBat":
      o = mirrorPair((s) => {
        const w = batWing(s, c ?? "#3a2340");
        w.position.set(s * 0.12, 0.2, -0.4);
        w.rotation.y = s * 0.45;
        return w;
      });
      break;
    case "shell": {
      const shell = mesh(new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(c ?? "#3f7d3a", { rough: 0.6 }), 0, -0.1, -0.35);
      shell.rotation.x = -Math.PI / 2;
      shell.scale.set(1, 1, 0.55);
      const rim = mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 24), mat(c2 ?? "#c9b06a"), 0, -0.1, -0.35);
      o = group(shell, rim);
      break;
    }
    case "drumRing": {
      const ring = mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 40), mat("#c8322c", { metal: 0.3 }), 0, 0.55, -0.55);
      const g = group(ring);
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        const drum = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 14), mat("#e8d4a8"), Math.sin(t) * 0.95, 0.55 + Math.cos(t) * 0.95, -0.55);
        drum.rotation.x = Math.PI / 2;
        const band = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 14), mat("#7a1f1a"), Math.sin(t) * 0.95, 0.55 + Math.cos(t) * 0.95, -0.55);
        band.rotation.x = Math.PI / 2;
        g.add(drum, band);
      }
      o = g;
      break;
    }
    case "tails": {
      const g = group();
      const m = mat(c ?? "#f7f3ea", { rough: 0.9 });
      const tip = mat(c2 ?? "#7fd0ff", { glow: 1.2 });
      for (let i = 0; i < 9; i++) {
        const t = -1.1 + (i / 8) * 2.2;
        const tail = mesh(new THREE.SphereGeometry(0.22, 10, 8), m, Math.sin(t) * 0.9, 0.8 + Math.cos(t) * 0.7, -0.5);
        tail.scale.set(0.7, 2.2, 0.7);
        tail.rotation.z = -t;
        const end = mesh(new THREE.SphereGeometry(0.12, 8, 6), tip, Math.sin(t) * 1.35, 0.8 + Math.cos(t) * 1.1, -0.5);
        g.add(tail, end);
      }
      g.userData.sway = true;
      o = g;
      break;
    }
    case "scorpionTail": {
      const m = mat(c ?? "#5a3a22", { metal: 0.3, rough: 0.4 });
      const g = group();
      const pts: [number, number, number][] = [[0, 0.1, -0.35], [0, 0.4, -0.75], [0, 1.0, -0.9], [0, 1.6, -0.75], [0, 1.95, -0.35], [0, 1.95, 0.0]];
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      for (let i = 0; i <= 10; i++) {
        const p = curve.getPoint(i / 10);
        g.add(mesh(new THREE.SphereGeometry(0.16 - i * 0.008, 10, 8), m, p.x, p.y, p.z));
      }
      const sting = mesh(new THREE.ConeGeometry(0.08, 0.35, 6), mat(c2 ?? "#c4f03a", { glow: 0.8 }), 0, 1.8, 0.1);
      sting.rotation.x = Math.PI * 0.85;
      g.add(sting);
      o = g;
      break;
    }
    case "monkeyTail":
      o = horn([[0, 0.1, -0.35], [0, 0.0, -0.8], [0, 0.4, -1.1], [0, 0.9, -1.0], [0, 1.0, -0.75]], 0.06, mat(c ?? "#8a5a2a", { rough: 0.9 }));
      break;
    case "fireWheels":
      o = mirrorPair((s) => {
        const w = mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 24), mat(c ?? "#ff6a1a", { glow: 2.5 }), s * 0.28, 0.12, 0);
        w.rotation.x = Math.PI / 2;
        w.userData.spin = true;
        return w;
      });
      break;
    case "mirror": {
      const disc = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 24), mat(c ?? "#120f1c", { metal: 1, rough: 0.05 }), 0, 0.05, 0.42);
      disc.rotation.x = Math.PI / 2;
      const rim = mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 24), GOLD(), 0, 0.05, 0.43);
      const glow = mesh(new THREE.CircleGeometry(0.2, 20), mat(c2 ?? "#9a5cff", { glow: 1.5, opacity: 0.6 }), 0, 0.05, 0.455);
      o = group(disc, rim, glow);
      break;
    }
    case "necklace": {
      const g = group();
      for (let i = 0; i < 9; i++) {
        const t = -1.2 + (i / 8) * 2.4;
        g.add(mesh(new THREE.SphereGeometry(i === 4 ? 0.08 : 0.05, 8, 6), i === 4 ? mat(c2 ?? "#ff5aa0", { glow: 0.8 }) : GOLD(c), Math.sin(t) * 0.38, 0.25 - Math.cos(t) * 0.12, 0.3 + Math.cos(t) * 0.08));
      }
      o = g;
      break;
    }
    case "cauldron": {
      const pot = mesh(new THREE.SphereGeometry(0.38, 14, 10), mat("#2b2b30", { metal: 0.7, rough: 0.4 }), 0, -0.1, -0.6);
      const brew = mesh(new THREE.CircleGeometry(0.3, 16), mat("#7ef07a", { glow: 1.2 }), 0, 0.15, -0.6);
      brew.rotation.x = -Math.PI / 2;
      o = group(pot, brew);
      break;
    }
    // ------------------------------------------------------------ objets tenus
    case "thunderbolt": {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.9);
      shape.lineTo(0.18, 0.35);
      shape.lineTo(0.05, 0.38);
      shape.lineTo(0.15, -0.2);
      shape.lineTo(-0.12, 0.2);
      shape.lineTo(0.02, 0.18);
      shape.lineTo(-0.1, 0.9);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
      g.translate(0, -0.2, -0.03);
      o = mesh(g, mat(c ?? "#ffe36a", { glow: 3 }));
      break;
    }
    case "flameTip":
      o = mesh(new THREE.OctahedronGeometry(0.14), mat(c ?? "#ff7a1a", { glow: 3 }), 0, 1.6, 0);
      break;
    case "trident": {
      const m = GOLD(c);
      const g = group(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6), mat("#5a3a22"), 0, 0.6, 0));
      for (const x of [-0.15, 0, 0.15]) g.add(mesh(new THREE.ConeGeometry(0.04, x === 0 ? 0.45 : 0.35, 4), m, x, 1.95 + (x === 0 ? 0.05 : 0), 0));
      g.add(mesh(new THREE.BoxGeometry(0.34, 0.05, 0.05), m, 0, 1.78, 0));
      o = g;
      break;
    }
  }
  applySurfaces(o, a.kind);
  if (a.pos) o.position.add(new THREE.Vector3(...a.pos));
  if (a.rot) o.rotation.set(o.rotation.x + a.rot[0], o.rotation.y + a.rot[1], o.rotation.z + a.rot[2]);
  if (a.scale) o.scale.multiplyScalar(a.scale);
  return o;
}

/** Matière par défaut de chaque accessoire (le métal et les parties lumineuses sont détectés). */
const SURFACE_BY_KIND: Partial<Record<AccessoryKind, Surface>> = {
  hornsBull: "bone", hornsRam: "bone", hornsDemon: "bone", antlers: "bone", beak: "bone", plate: "bone", shell: "bone", scorpionTail: "bone", eyeBig: "plain",
  earsCat: "fur", earsJackal: "fur", earsSet: "fur", earsPig: "leather", earsRound: "fur", lionMane: "fur", furHood: "fur", beard: "fur", tails: "fur", monkeyTail: "fur", jaguarHelm: "fur",
  snoutCroc: "leather", snoutJackal: "fur", snoutPig: "leather", snoutLong: "leather", snakeHair: "leather", wingsBat: "leather",
  nemes: "linen", veil: "linen", qingHat: "velvet", plumeCrest: "velvet", drumRing: "leather", hairBun: "fur", cauldron: "metal",
};

function applySurfaces(o: THREE.Object3D, kind: AccessoryKind): void {
  o.traverse((child) => {
    const m = child as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.map) return; // plumes déjà texturées
    const glowing = mat.emissiveIntensity > 0 && mat.emissive.getHex() !== 0;
    const surface: Surface = glowing ? "plain" : mat.metalness > 0.5 ? "metal" : (SURFACE_BY_KIND[kind] ?? "plain");
    m.material = withSurface(mat, surface);
  });
}
