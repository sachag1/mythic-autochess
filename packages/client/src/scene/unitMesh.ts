// Unités en formes simples, en attendant de vrais modèles : corps de la couleur du panthéon,
// emblème selon la classe, taille selon le coût, gemmes des objets qui tournent autour.
import * as THREE from "three/webgpu";
import { classOf, itemStyle, unitColor, unitDef } from "../data/content";

const geometries = {
  body: new THREE.CylinderGeometry(0.3, 0.4, 0.9, 20),
  base: new THREE.CylinderGeometry(0.62, 0.62, 0.05, 32),
  shield: new THREE.SphereGeometry(0.75, 24, 16),
  stun: new THREE.TorusGeometry(0.28, 0.05, 8, 24),
  gem: new THREE.OctahedronGeometry(0.1),
  emblem: {
    guardian: new THREE.BoxGeometry(0.42, 0.42, 0.42),
    warrior: new THREE.ConeGeometry(0.26, 0.55, 4),
    beast: new THREE.DodecahedronGeometry(0.27),
    hunter: new THREE.TetrahedronGeometry(0.33),
    sorcerer: new THREE.IcosahedronGeometry(0.28),
    trickster: new THREE.TorusGeometry(0.2, 0.08, 10, 20),
    oracle: new THREE.OctahedronGeometry(0.3),
    monster: new THREE.SphereGeometry(0.3, 16, 12),
  } as Record<string, THREE.BufferGeometry>,
};

const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string, opts: { emissive?: number; transparent?: number; metal?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.emissive ?? 0}|${opts.transparent ?? 1}|${opts.metal ?? 0}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: opts.metal ?? 0.1 });
    if (opts.emissive) {
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = opts.emissive;
    }
    if (opts.transparent !== undefined && opts.transparent < 1) {
      m.transparent = true;
      m.opacity = opts.transparent;
      m.depthWrite = false;
    }
    materials.set(key, m);
  }
  return m;
}

export const TEAM_COLORS = { ally: "#3fa9f5", enemy: "#e5484d" };

export interface UnitMesh {
  root: THREE.Group;
  /** Partie animée (sauts, attaques) au-dessus du socle. */
  figure: THREE.Group;
  base: THREE.Mesh;
  shield: THREE.Mesh;
  stun: THREE.Mesh;
  gems: THREE.Group;
  /** Hauteur du haut de l'unité, pour placer les barres de vie. */
  height: number;
  scale: number;
}

export function createUnitMesh(defId: string, star: number, team: "ally" | "enemy"): UnitMesh {
  const def = unitDef(defId);
  const scale = (0.95 + 0.09 * (def?.cost ?? 1)) * (1 + 0.1 * (star - 1));
  const color = unitColor(def);

  const root = new THREE.Group();
  const figure = new THREE.Group();
  figure.scale.setScalar(scale);
  root.add(figure);

  const base = new THREE.Mesh(geometries.base, material(TEAM_COLORS[team], { emissive: 0.6 }));
  base.position.y = 0.03;
  base.receiveShadow = true;
  root.add(base);

  const body = new THREE.Mesh(geometries.body, material(color, { metal: 0.25 }));
  body.position.y = 0.5;
  body.castShadow = true;
  figure.add(body);

  const cls = classOf(def) ?? "monster";
  const emblem = new THREE.Mesh(geometries.emblem[cls] ?? geometries.emblem.monster!, material(lighten(color), { emissive: 0.15 }));
  emblem.position.y = 1.22;
  emblem.castShadow = true;
  emblem.name = "emblem";
  figure.add(emblem);

  // Une couronne de sphères dorées par étoile au-dessus de 1.
  for (let i = 0; i < star - 1; i++) {
    const crown = new THREE.Mesh(geometries.gem, material("#ffd54a", { emissive: 0.8, metal: 0.8 }));
    crown.position.set((i - (star - 2) / 2) * 0.24, 1.62, 0);
    crown.scale.setScalar(0.9);
    figure.add(crown);
  }

  const gems = new THREE.Group();
  gems.position.y = 0.6;
  figure.add(gems);

  const shield = new THREE.Mesh(geometries.shield, material("#cfe8ff", { transparent: 0.22, emissive: 0.5 }));
  shield.position.y = 0.65;
  shield.visible = false;
  figure.add(shield);

  const stun = new THREE.Mesh(geometries.stun, material("#ffe14d", { emissive: 1 }));
  stun.rotation.x = Math.PI / 2;
  stun.position.y = 1.75;
  stun.visible = false;
  figure.add(stun);

  return { root, figure, base, shield, stun, gems, height: 1.75 * scale, scale };
}

export function setUnitItems(mesh: UnitMesh, items: readonly string[]): void {
  mesh.gems.clear();
  items.forEach((id, i) => {
    const gem = new THREE.Mesh(geometries.gem, material(itemStyle(id).color, { emissive: 0.5, metal: 0.5 }));
    const angle = (i / Math.max(1, items.length)) * Math.PI * 2;
    gem.position.set(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5);
    mesh.gems.add(gem);
  });
}

export function setTeam(mesh: UnitMesh, team: "ally" | "enemy"): void {
  mesh.base.material = material(TEAM_COLORS[team], { emissive: 0.6 });
}

function lighten(hex: string): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color("#ffffff"), 0.45);
  return `#${c.getHexString()}`;
}

/** Anneau au sol qui s'élargit (lancement de sort). */
export function createRing(color: string): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  return ring;
}

const projectileGeometry = new THREE.SphereGeometry(0.11, 10, 8);
export function createProjectile(color: string): THREE.Mesh {
  return new THREE.Mesh(projectileGeometry, material(color, { emissive: 1.2 }));
}
