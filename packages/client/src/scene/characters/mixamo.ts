// Apparence réaliste des personnages avec les modèles Mixamo (voir MIXAMO.md) : corps,
// teinte, objets tenus et accessoires. Les unités absentes d'ici (créatures : Fenrir,
// Kitsune, Orochi…) gardent leur modèle de catalog.ts. Si les fichiers Mixamo ne sont pas
// présents (dépôt cloné sans eux), tout le monde garde les modèles KayKit.
import type { AccessoryDef } from "./accessories";
import type { AttackStyle, PropDef } from "./catalog";

export type MixamoBody =
  | "akai" | "amazon" | "archer" | "arissa" | "brute" | "demoness" | "dreyar" | "eve" | "ganfaul" | "goblin" | "guard" | "heraklios"
  | "hulk" | "kachujin" | "knight" | "maw" | "morak" | "mutant" | "nightshade" | "ninja" | "orc" | "paladin" | "sorceress" | "undead" | "uriel" | "vampire";

export interface MixamoSpec {
  body: MixamoBody;
  /** Teinte mélangée aux textures (0 = aucune). */
  tint?: string;
  tintAmount?: number;
  /** Maillages du modèle à masquer (casque…). */
  hide?: string[];
  props?: PropDef[];
  acc?: AccessoryDef[];
  scale?: number;
  /** Style d'attaque si différent du catalogue (ex. brutes : coups de griffes). */
  attack?: AttackStyle;
  /** Animation du sort (nom dans animations.glb). */
  cast?: string;
  /** Corps massif : animations d'attente et de course « mutant ». */
  brute?: boolean;
}

const q = (id: string, hand: "r" | "l" = "r", scale = 0.3, extra: Partial<PropDef> = {}): PropDef => ({ id: `q_${id}`, hand, scale, ...extra });
const k = (id: string, hand: "r" | "l" = "r", extra: Partial<PropDef> = {}): PropDef => ({ id, hand, ...extra });

export const MIXAMO_CHARACTERS: Record<string, MixamoSpec> = {
  // Grèce
  medusa: { body: "sorceress", tint: "#5fb06a", tintAmount: 0.35, acc: [{ kind: "snakeHair", color: "#3f8f3a" }], cast: "magic_shot" },
  satyr: { body: "goblin", tint: "#8a6a3a", tintAmount: 0.2, acc: [{ kind: "hornsRam" }], props: [q("bow_wooden", "l")], scale: 0.95, cast: "bow" },
  cyclops: { body: "mutant", tint: "#b09070", tintAmount: 0.25, props: [q("hammer_double", "r", 0.36)], scale: 1.12, brute: true, cast: "roar" },
  achilles: { body: "heraklios", tint: "#d8a050", tintAmount: 0.2, acc: [{ kind: "plumeCrest", pos: [0, 0.25, 0] }], props: [q("spear", "r", 0.26), k("shield_round_color", "l", { tint: "#e0a050" })], cast: "jump_attack" },
  athena: { body: "amazon", acc: [{ kind: "plumeCrest", color: "#2f5fb3", pos: [0, 0.1, 0] }], props: [q("spear", "r", 0.26), k("shield_badge_color", "l", { tint: "#ffe2a0" })], cast: "block" },
  hades: { body: "vampire", tint: "#3a4a8a", tintAmount: 0.3, acc: [{ kind: "crown", color: "#3a3a4a", color2: "#3a8bff" }], props: [q("scythe", "r", 0.32, { tint: "#5a6aa0" })], cast: "cast" },
  zeus: { body: "uriel", acc: [{ kind: "laurel", color: "#e3b23c" }, { kind: "thunderbolt" }], scale: 1.05, cast: "cast3" },
  // Nordiques
  valkyrie: { body: "amazon", tint: "#b8c8e0", tintAmount: 0.4, acc: [{ kind: "wingedHelm" }], props: [q("spear", "r", 0.24), k("shield_round", "l")], cast: "stab" },
  skadi: { body: "archer", tint: "#cfe6ff", tintAmount: 0.35, props: [q("bow_wooden", "l", 0.3, { tint: "#cfeaff" })], cast: "bow" },
  draugr: { body: "undead", tint: "#6a9a8a", tintAmount: 0.3, props: [k("skel_axe", "r"), k("skel_shield_large_a", "l")], cast: "block" },
  loki: { body: "dreyar", tint: "#4f9a4a", tintAmount: 0.3, acc: [{ kind: "hornsDemon", color: "#e3b23c" }], props: [k("dagger", "r"), k("dagger", "l")], cast: "magic_shot" },
  freyja: { body: "eve", tint: "#e8a0b0", tintAmount: 0.25, acc: [{ kind: "wingsFeather", color: "#8a5a2a", color2: "#d8b080" }, { kind: "necklace", color2: "#ff5aa0" }], props: [q("bow_golden", "l")], cast: "bow" },
  thor: { body: "morak", tint: "#c86a4a", tintAmount: 0.2, acc: [{ kind: "wingedHelm", color: "#c0c8d0" }], props: [q("hammer_double", "r", 0.3)], scale: 1.08, cast: "jump_attack" },
  // Égypte
  bastet: { body: "nightshade", tint: "#2a2430", tintAmount: 0.3, acc: [{ kind: "earsCat", color: "#1d1b20" }, { kind: "necklace" }], props: [k("dagger", "r"), k("dagger", "l")], cast: "slash3" },
  sobek: { body: "orc", tint: "#5f8a4a", tintAmount: 0.35, acc: [{ kind: "nemes", color: "#2fb5a8" }], props: [k("axe_2handed", "r")], scale: 1.05, brute: true, cast: "spin" },
  sekhmet: { body: "demoness", tint: "#d86a3a", tintAmount: 0.35, acc: [{ kind: "lionMane" }, { kind: "sunDisc", color: "#ff5a2a", scale: 0.7, pos: [0, 0.3, 0] }], props: [k("axe_1handed", "r"), k("axe_1handed", "l")], cast: "roar" },
  anubis: { body: "ganfaul", tint: "#2a2430", tintAmount: 0.3, acc: [{ kind: "earsJackal" }, { kind: "necklace" }], props: [k("staff", "r", { tint: "#e3b23c" }), k("shield_badge", "l")], cast: "cast" },
  isis: { body: "sorceress", tint: "#9ab8ff", tintAmount: 0.3, acc: [{ kind: "wingsFeather", color: "#2348a8", color2: "#e3b23c" }, { kind: "sunDisc", color: "#ff7a3a", scale: 0.8 }], props: [k("wand", "r")], cast: "cast3" },
  set: { body: "maw", tint: "#b04a2a", tintAmount: 0.45, props: [q("axe_double", "r", 0.3)], scale: 1.05, brute: true, cast: "spin" },
  ra: { body: "uriel", tint: "#ffd27a", tintAmount: 0.3, acc: [{ kind: "sunDisc", scale: 1.25, pos: [0, 0.25, 0] }], props: [k("staff", "r", { tint: "#e3b23c", glow: "#ffb02a" })], scale: 1.08, cast: "cast3" },
  // Japon
  kitsune: { body: "kachujin", tint: "#f4ede0", tintAmount: 0.45, acc: [{ kind: "earsCat", color: "#f4ede0", scale: 0.9 }, { kind: "tails", scale: 0.55 }], attack: "magic", cast: "cast2" },
  tengu: { body: "ninja", tint: "#c8322c", tintAmount: 0.25, acc: [{ kind: "wingsRaven" }], props: [q("katana", "r", 0.42)], cast: "slash" },
  kappa: { body: "goblin", tint: "#5faa5a", tintAmount: 0.45, acc: [{ kind: "plate" }, { kind: "shell" }], props: [k("dagger", "r")], scale: 0.9, cast: "leap" },
  raijin: { body: "hulk", tint: "#5a7ad8", tintAmount: 0.35, acc: [{ kind: "drumRing" }, { kind: "hornsDemon" }], brute: true, attack: "magic", cast: "cast" },
  susanoo: { body: "kachujin", tint: "#3a4a8a", tintAmount: 0.25, props: [q("katana", "r", 0.5)], scale: 1.05, cast: "spin" },
  yukionna: { body: "arissa", tint: "#dff0ff", tintAmount: 0.5, cast: "cast2" },
  // Chine
  zhubajie: { body: "brute", tint: "#e8a0a8", tintAmount: 0.2, acc: [{ kind: "earsPig" }], props: [q("scythe", "r", 0.32, { tint: "#d0b080" })], scale: 1.05, cast: "great_slash" },
  jiangshi: { body: "undead", tint: "#8aa8a0", tintAmount: 0.3, acc: [{ kind: "qingHat" }], attack: "unarmed", cast: "magic_shot" },
  nezha: { body: "akai", tint: "#d8322c", tintAmount: 0.35, acc: [{ kind: "fireWheels" }], props: [q("spear", "r", 0.22)], cast: "spin" },
  shawujing: { body: "orc", tint: "#6a8ab8", tintAmount: 0.4, acc: [{ kind: "necklace", color: "#efe6cf", color2: "#efe6cf" }], props: [k("skel_staff", "r")], brute: true, cast: "block" },
  houyi: { body: "knight", tint: "#d8a030", tintAmount: 0.2, props: [q("bow_golden", "l", 0.32)], attack: "bow", cast: "bow" },
  erlangshen: { body: "dreyar", tint: "#d8dee6", tintAmount: 0.3, acc: [{ kind: "thirdEye" }], props: [q("spear", "r", 0.26)], cast: "stab" },
  wukong: { body: "goblin", tint: "#e8b040", tintAmount: 0.35, acc: [{ kind: "circlet" }, { kind: "monkeyTail" }], props: [k("staff", "r", { tint: "#e3b23c", glow: "#ffcf4a" })], cast: "spin" },
  // Celtes
  selkie: { body: "eve", tint: "#7a9ab0", tintAmount: 0.4, props: [k("wand", "r")], cast: "cast2" },
  cuchulainn: { body: "heraklios", tint: "#4f9a5a", tintAmount: 0.3, props: [q("spear", "r", 0.26, { tint: "#ff8a7a" }), k("shield_round", "l")], cast: "throw" },
  morrigan: { body: "nightshade", tint: "#3a2a5a", tintAmount: 0.35, acc: [{ kind: "wingsRaven" }], cast: "cast" },
  banshee: { body: "arissa", tint: "#e8f0ff", tintAmount: 0.6, cast: "cast2" },
  dagda: { body: "brute", tint: "#8a6a4a", tintAmount: 0.2, acc: [{ kind: "cauldron" }], props: [q("hammer_double", "r", 0.3, { tint: "#c49a6a" })], scale: 1.12, cast: "cast2" },
  cernunnos: { body: "maw", tint: "#5f8a3a", tintAmount: 0.35, acc: [{ kind: "necklace", color: "#c9a04a", color2: "#7aff8a" }], props: [k("staff", "r")], attack: "magic", cast: "cast" },
  lugh: { body: "paladin", tint: "#ffe08a", tintAmount: 0.35, acc: [{ kind: "halo" }], props: [q("spear", "r", 0.28, { tint: "#ffe08a", glow: "#ffd23a" })], scale: 1.05, cast: "throw" },
  // Aztèques
  jaguar: { body: "akai", tint: "#e3a93a", tintAmount: 0.35, props: [k("sword_1handed", "r", { tint: "#3a3040" }), k("dagger", "l", { tint: "#3a3040" })], cast: "stab" },
  tlaloc: { body: "sorceress", tint: "#4a8ad8", tintAmount: 0.4, acc: [{ kind: "featherHeaddress", color: "#1f7ac8", color2: "#7ad0ff" }], cast: "cast3" },
  huitzilopochtli: { body: "knight", tint: "#3a6ad8", tintAmount: 0.3, acc: [{ kind: "featherHeaddress", color: "#1fa5c8", color2: "#3cae5a" }], props: [q("bow_evil", "l", 0.3, { tint: "#ff8a3a" })], attack: "bow", cast: "bow" },
  mictlantecuhtli: { body: "undead", tint: "#e8d8c0", tintAmount: 0.2, acc: [{ kind: "featherHeaddress", color: "#17151c", color2: "#c8392c" }], props: [k("skel_staff", "r")], cast: "cast" },
  tezcatlipoca: { body: "ninja", tint: "#17151c", tintAmount: 0.4, acc: [{ kind: "mirror" }, { kind: "featherHeaddress", color: "#17151c", color2: "#e8c13a", scale: 0.8 }], props: [k("dagger", "r"), k("dagger", "l")], scale: 1.05, cast: "magic_shot" },
  // Mésopotamie
  lamassu: { body: "hulk", tint: "#e8c47a", tintAmount: 0.45, acc: [{ kind: "wingsFeather", color: "#e3b23c", color2: "#2347a0" }, { kind: "hornedCap" }], brute: true, attack: "unarmed", cast: "roar" },
  enkidu: { body: "mutant", tint: "#8a6a4a", tintAmount: 0.3, brute: true, attack: "bite", cast: "roar" },
  girtablilu: { body: "akai", tint: "#8a6a3a", tintAmount: 0.35, acc: [{ kind: "scorpionTail" }], props: [k("crossbow_1handed", "r")], attack: "crossbow", cast: "bow_release" },
  ishtar: { body: "eve", tint: "#5a7ad8", tintAmount: 0.3, acc: [{ kind: "starCrown" }, { kind: "wingsFeather", color: "#2347a0", color2: "#e3b23c", scale: 0.75 }], props: [q("bow_golden", "l")], cast: "bow" },
  marduk: { body: "guard", tint: "#4a6ad8", tintAmount: 0.3, acc: [{ kind: "hornedCap" }], props: [k("sword_1handed", "r"), k("shield_spikes", "l")], scale: 1.05, cast: "cast3" },
  gilgamesh: { body: "paladin", tint: "#e8c050", tintAmount: 0.4, hide: ["Paladin_J_Nordstrom"], acc: [{ kind: "crown" }], props: [q("sword_golden", "r", 0.36)], scale: 1.1, cast: "great_slash" },
  // Monstres PvE
  harpy: { body: "demoness", tint: "#8a7a9a", tintAmount: 0.4, acc: [{ kind: "wingsFeather", color: "#4a3a5a", color2: "#9a8aaa" }], cast: "magic_shot" },
  minotaur: { body: "orc", tint: "#7a4a2a", tintAmount: 0.35, acc: [{ kind: "hornsBull" }], props: [k("axe_2handed", "r")], scale: 1.2, brute: true, cast: "great_slash" },
};

/** Animations Mixamo par action (noms dans animations.glb). */
export const MIXAMO_ATTACKS: Record<AttackStyle, string[]> = {
  melee1h: ["slash", "slash2", "stab", "slash3"],
  melee2h: ["great_slash", "slash2", "spin"],
  dual: ["stab", "slash3", "slash"],
  unarmed: ["punch", "kick"],
  bow: ["bow_release", "bow"],
  crossbow: ["bow_release"],
  magic: ["magic_shot", "cast2"],
  thrown: ["throw"],
  bite: ["swipe", "punch"],
};

export const MIXAMO_LOGICAL: Record<string, string[]> = {
  idle: ["idle"],
  combatIdle: ["combat_idle", "idle"],
  run: ["run"],
  hit: ["hit"],
  stun: ["stun"],
  death: ["death", "death2"],
  jump: ["leap"],
  victory: ["victory"],
  dance: ["dance", "taunt"],
};

let available: Promise<boolean> | null = null;

/** Les fichiers Mixamo convertis sont-ils présents ? (exclus de git, voir MIXAMO.md) */
export function mixamoAvailable(): Promise<boolean> {
  if (new URLSearchParams(location.search).has("kaykit")) return Promise.resolve(false);
  available ??= fetch(`${import.meta.env.BASE_URL}assets/mixamo/animations.glb`, { method: "HEAD" })
    .then((r) => r.ok && !(r.headers.get("content-type") ?? "").includes("html"))
    .catch(() => false);
  return available;
}
