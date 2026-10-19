// Armes réalistes des personnages Mixamo : armes extraites des variantes Mixamo (épée,
// lame, bouclier, arc ; déjà dans le repère de la main), armes Poly Haven (katana, dague,
// marteau, haches ; orientées lame vers +x, poignée à l'origine) et armes modélisées ici
// (lance, bâton, baguette, faux) avec des matériaux PBR. Unités : mètres pour un corps de 1,80 m.
import * as THREE from "three/webgpu";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { namedNode } from "../assets";

export interface RealProp {
  object: THREE.Object3D;
  /** Os Mixamo auquel rattacher l'objet. */
  bone: string;
}

/** Arme du catalogue (KayKit / Quaternius) → arme réaliste. */
const REAL: Record<string, string> = {
  sword_1handed: "mx:mx_sword", skel_blade: "mx:mx_sword", sword_2handed: "mx:mx_blade", sword_2handed_color: "mx:mx_blade",
  q_sword_golden: "mx:mx_blade", q_claymore: "mx:mx_blade",
  shield_round: "mx:mx_shield", shield_round_color: "mx:mx_shield", shield_badge: "mx:mx_shield", shield_badge_color: "mx:mx_shield",
  shield_square: "mx:mx_shield", shield_spikes: "mx:mx_shield", shield_spikes_color: "mx:mx_shield", skel_shield_large_a: "mx:mx_shield",
  skel_shield_large_b: "mx:mx_shield", skel_shield_small_a: "mx:mx_shield", q_shield_celtic_golden: "mx:mx_shield",
  q_bow_wooden: "mx:mx_bow", q_bow_golden: "mx:mx_bow", q_bow_evil: "mx:mx_bow", crossbow_1handed: "mx:mx_bow", crossbow_2handed: "mx:mx_bow",
  dagger: "ph:ornate_medieval_dagger", q_dagger_2: "ph:ornate_medieval_dagger",
  axe_1handed: "ph:wooden_axe_02", skel_axe: "ph:wooden_axe_02", axe_2handed: "ph:wooden_axe", q_axe_double: "ph:wooden_axe",
  q_hammer_double: "ph:ornate_war_hammer", q_katana: "ph:antique_katana_01",
  q_spear: "proc:spear", staff: "proc:staff", skel_staff: "proc:staff", wand: "proc:wand", q_scythe: "proc:scythe",
};

const BONE_OF: Record<string, string> = { mx_shield: "mixamorigLeftForeArm", mx_bow: "mixamorigLeftHand" };

const wood = new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.75, metalness: 0 });
const steel = new THREE.MeshStandardMaterial({ color: "#c8ccd2", roughness: 0.28, metalness: 1 });
const bronze = new THREE.MeshStandardMaterial({ color: "#b07a3a", roughness: 0.35, metalness: 1 });
const leather = new THREE.MeshStandardMaterial({ color: "#3a2618", roughness: 0.85 });

/** Armes modélisées en code, le long de +x, poignée à l'origine (mètres). */
function procedural(kind: string): THREE.Object3D {
  const g = new THREE.Group();
  const along = (mesh: THREE.Mesh, from: number, length: number) => {
    mesh.geometry.rotateZ(-Math.PI / 2);
    mesh.position.x = from + length / 2;
    g.add(mesh);
    return mesh;
  };
  switch (kind) {
    case "spear": {
      along(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 2.1, 10), wood), -0.6, 2.1);
      along(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.12, 10), leather), -0.06, 0.12);
      const head = along(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 4), steel), 1.5, 0.32);
      head.scale.set(1, 1, 0.35);
      along(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.06, 10), bronze), 1.45, 0.06);
      break;
    }
    case "staff": {
      along(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 1.7, 10), wood), -0.45, 1.7);
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 2), new THREE.MeshStandardMaterial({ color: "#9fd8ff", emissive: "#4ab0ff", emissiveIntensity: 2.5, roughness: 0.1 }));
      orb.position.x = 1.33;
      g.add(orb);
      for (let i = 0; i < 3; i++) {
        const prong = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.16, 5), bronze);
        prong.position.set(1.26, Math.cos((i * Math.PI * 2) / 3) * 0.05, Math.sin((i * Math.PI * 2) / 3) * 0.05);
        prong.rotation.z = -Math.PI / 2 + 0.4;
        g.add(prong);
      }
      break;
    }
    case "wand": {
      along(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.013, 0.36, 8), wood), -0.05, 0.36);
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.025), new THREE.MeshStandardMaterial({ color: "#ffe6a0", emissive: "#ffcf4a", emissiveIntensity: 3 }));
      tip.position.x = 0.33;
      g.add(tip);
      break;
    }
    case "scythe": {
      along(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.8, 10), wood), -0.5, 1.8);
      const blade = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 4, 24, Math.PI * 0.6), steel);
      blade.scale.set(1, 1, 0.25);
      blade.position.set(1.0, -0.4, 0);
      g.add(blade);
      break;
    }
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** Arme réaliste correspondant à un objet du catalogue, ou null si aucune. */
export function realProp(id: string, hand: "r" | "l", mixamoWeapons: GLTF | undefined, polyhavenWeapons: GLTF | undefined): RealProp | null {
  const ref = REAL[id];
  if (!ref) return null;
  const [source, name] = ref.split(":") as [string, string];
  let object: THREE.Object3D | null = null;
  if (source === "mx" && mixamoWeapons) object = namedNode(mixamoWeapons, name)?.clone(true) ?? null;
  else if (source === "ph" && polyhavenWeapons) object = namedNode(polyhavenWeapons, name)?.clone(true) ?? null;
  else if (source === "proc") object = procedural(name);
  if (!object) return null;
  const holder = new THREE.Group();
  holder.add(object);
  // Les armes Poly Haven et les armes en code pointent vers +x, comme l'épée Mixamo dans
  // la main droite ; dans la main gauche, l'axe est inversé.
  if (source !== "mx" && hand === "l") holder.rotation.y = Math.PI;
  const bone = BONE_OF[name] ?? (hand === "r" ? "mixamorigRightHand" : "mixamorigLeftHand");
  return { object: holder, bone };
}
