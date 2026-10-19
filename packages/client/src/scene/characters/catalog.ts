// Apparence de chaque personnage : corps de base (KayKit ou créature Quaternius), couleurs,
// armes, accessoires modélisés en code, style d'attaque et aura. Un personnage = une entrée.
import type { AccessoryDef } from "./accessories";
import type { Palette } from "./recolor";

export type HumanoidBody = "knight" | "barbarian" | "mage" | "rogue" | "rogue_hooded" | "skeleton_mage" | "skeleton_minion" | "skeleton_rogue" | "skeleton_warrior";
export type CreatureBody = "wolf" | "fox" | "husky" | "bull" | "stag" | "snake" | "snake_angry" | "spider" | "trex";
export type BodyId = HumanoidBody | CreatureBody;

export const HUMANOID_BODIES: readonly HumanoidBody[] = ["knight", "barbarian", "mage", "rogue", "rogue_hooded", "skeleton_mage", "skeleton_minion", "skeleton_rogue", "skeleton_warrior"];
export const isHumanoid = (b: BodyId): b is HumanoidBody => (HUMANOID_BODIES as readonly string[]).includes(b);

export type AttackStyle = "melee1h" | "melee2h" | "dual" | "unarmed" | "bow" | "crossbow" | "magic" | "thrown" | "bite";
export type AuraKind = "embers" | "wisps" | "snow" | "sparks" | "leaves" | "smoke" | "water" | "sand" | "stars" | "petals" | "shadow" | "lightning";

export interface PropDef {
  id: string;
  hand: "r" | "l";
  scale?: number;
  pos?: [number, number, number];
  rot?: [number, number, number];
  /** Teinte multipliée sur tous les matériaux de l'objet. */
  tint?: string;
  glow?: string;
}

export interface CharSpec {
  body: BodyId;
  palette?: Palette;
  /** Créatures : couleur par nom de matériau. */
  matColors?: Record<string, string>;
  /** Objets intégrés au modèle KayKit à afficher (tous masqués sinon). */
  show?: string[];
  /** Pièces de tenue intégrées à masquer (chapeau, casque, cape). */
  hide?: string[];
  props?: PropDef[];
  acc?: AccessoryDef[];
  scale?: number;
  /** Serpents à plusieurs têtes (hydre, Orochi). */
  heads?: number;
  attack: AttackStyle;
  /** Animation du sort (humanoïdes). */
  cast?: string;
  aura?: AuraKind;
  /** Fantôme translucide. */
  ghost?: boolean;
  /** Couleur des yeux lumineux (squelettes). */
  eyes?: string;
}

// Raccourcis d'armes (props.glb). Les armes Quaternius ont la poignée à l'origine, axe +y,
// comme l'emplacement de main KayKit : seule l'échelle change.
const q = (id: string, hand: "r" | "l" = "r", scale = 0.32, extra: Partial<PropDef> = {}): PropDef => ({ id: `q_${id}`, hand, scale, ...extra });
const k = (id: string, hand: "r" | "l" = "r", extra: Partial<PropDef> = {}): PropDef => ({ id, hand, ...extra });

const GOLD = "#e3b23c";

export const CHARACTERS: Record<string, CharSpec> = {
  // ================================================================ Grèce
  medusa: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#2f7d5a", secondary: GOLD, skin: "#9fc49a" },
    acc: [{ kind: "snakeHair", color: "#3f8f3a" }, { kind: "necklace" }], show: ["1H_Wand"], attack: "magic", cast: "Spellcast_Shoot", aura: "wisps",
  },
  satyr: {
    body: "rogue", palette: { primary: "#6f8f3a", secondary: "#8a5a2a", skin: "#d9a57a", leather: "#5a3a22" },
    acc: [{ kind: "hornsRam" }, { kind: "laurel" }], props: [q("bow_wooden", "l", 0.3)], attack: "bow", cast: "1H_Ranged_Shoot", aura: "leaves",
  },
  cyclops: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: "#7a5a3a", secondary: "#b0a080", skin: "#c9a27a" },
    acc: [{ kind: "eyeBig" }], props: [q("hammer_double", "r", 0.34)], scale: 1.12, attack: "melee2h", cast: "Throw",
  },
  achilles: {
    body: "knight", palette: { primary: "#b8302c", secondary: GOLD, metal: "#c08a3a" },
    acc: [{ kind: "plumeCrest", pos: [0, 0.35, 0] }], props: [q("spear", "r", 0.26), k("shield_round_color", "l", { tint: "#e0a050" })], attack: "melee1h", cast: "1H_Melee_Attack_Jump_Chop", aura: "embers",
  },
  athena: {
    body: "knight", palette: { primary: "#f2efe6", secondary: GOLD, metal: "#e3c27a" },
    acc: [{ kind: "plumeCrest", color: "#2f5fb3", pos: [0, 0.35, 0] }, { kind: "laurel", color: GOLD }], props: [q("spear", "r", 0.26), k("shield_badge_color", "l", { tint: "#ffe2a0" })], attack: "melee1h", cast: "Block", aura: "stars",
  },
  hades: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#1c1a26", secondary: "#3a6bd8", skin: "#a8b0c4" },
    acc: [{ kind: "crown", color: "#4a4a5a", color2: "#3a8bff" }, { kind: "beard", color: "#2a2a3a" }], props: [q("scythe", "r", 0.3, { tint: "#5a6aa0" })], attack: "magic", cast: "Spellcast_Summon", aura: "shadow",
  },
  zeus: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#f2efe6", secondary: GOLD, skin: "#f0c9a5" },
    acc: [{ kind: "laurel", color: GOLD }, { kind: "beard", color: "#f4f4f4" }, { kind: "thunderbolt" }], show: ["2H_Staff"], scale: 1.05, attack: "magic", cast: "Spellcast_Raise", aura: "lightning",
  },

  // ================================================================ Nordiques
  valkyrie: {
    body: "knight", hide: ["Knight_Helmet"], palette: { primary: "#2c4a7a", secondary: "#c0c8d0", metal: "#c8d2dc" },
    acc: [{ kind: "wingedHelm" }], props: [q("spear", "r", 0.24), k("shield_round", "l")], attack: "melee1h", cast: "1H_Melee_Attack_Stab",
  },
  skadi: {
    body: "rogue_hooded", palette: { primary: "#dfeef7", secondary: "#8fc4e8", skin: "#f2d6c4", leather: "#c8d6e0" },
    acc: [{ kind: "furHood" }], props: [q("bow_wooden", "l", 0.3, { tint: "#cfeaff" })], attack: "bow", cast: "1H_Ranged_Shoot", aura: "snow",
  },
  draugr: {
    body: "skeleton_warrior", palette: { primary: "#3f5a4a", secondary: "#6a8a6a" }, eyes: "#7affc8",
    props: [k("skel_axe", "r"), k("skel_shield_large_a", "l")], attack: "melee1h", cast: "Block", aura: "smoke",
  },
  loki: {
    body: "rogue", palette: { primary: "#2f7d3a", secondary: GOLD, skin: "#e8c4a5", leather: "#1f3a22" },
    acc: [{ kind: "hornsDemon", color: GOLD }, { kind: "circlet", color: GOLD }], show: ["Knife", "Knife_Offhand"], attack: "dual", cast: "Spellcast_Shoot", aura: "wisps",
  },
  freyja: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#d86a8a", secondary: GOLD, skin: "#f2d0b4", leather: "#e8c45a" },
    acc: [{ kind: "wingsFeather", color: "#8a5a2a", color2: "#d8b080" }, { kind: "necklace", color2: "#ff5aa0" }, { kind: "hairBun", color: "#e8c45a" }], props: [q("bow_golden", "l", 0.3)], attack: "bow", cast: "1H_Ranged_Shoot", aura: "petals",
  },
  fenrir: {
    body: "wolf", matColors: { Main: "#2a2a30", Main_Light: "#5a5a66", Eyes_Black: "#ff3a2a", Nose: "#111111" }, scale: 1.25, attack: "bite", aura: "shadow",
  },
  thor: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: "#9e2b25", secondary: "#c0c8d0", leather: "#c4552a" },
    acc: [{ kind: "wingedHelm", color: "#c0c8d0" }, { kind: "beard", color: "#c4552a" }], props: [q("hammer_double", "r", 0.3)], scale: 1.1, attack: "melee2h", cast: "1H_Melee_Attack_Jump_Chop", aura: "lightning",
  },

  // ================================================================ Égypte
  bastet: {
    body: "rogue", palette: { primary: "#1d1b20", secondary: GOLD, skin: "#8a5a3a", leather: "#2a2224" },
    acc: [{ kind: "earsCat", color: "#1d1b20" }, { kind: "necklace" }], show: ["Knife", "Knife_Offhand"], attack: "dual", cast: "Dualwield_Melee_Attack_Slice",
  },
  sobek: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: "#2348a8", secondary: GOLD, skin: "#5f8a4a", leather: "#3f5a2a" },
    acc: [{ kind: "snoutCroc" }, { kind: "nemes", color: "#2fb5a8" }], show: ["2H_Axe"], scale: 1.05, attack: "melee2h", cast: "2H_Melee_Attack_Spin", aura: "water",
  },
  sekhmet: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: "#b8302c", secondary: GOLD, skin: "#d8a05a", leather: "#a8642a" },
    acc: [{ kind: "lionMane" }, { kind: "sunDisc", color: "#ff5a2a", scale: 0.7, pos: [0, 0.3, 0] }], show: ["1H_Axe", "1H_Axe_Offhand"], attack: "dual", cast: "Taunt", aura: "embers",
  },
  anubis: {
    body: "knight", hide: ["Knight_Helmet"], palette: { primary: "#1d1b20", secondary: GOLD, skin: "#1d1b20", metal: GOLD },
    acc: [{ kind: "snoutJackal" }, { kind: "earsJackal" }, { kind: "necklace" }], props: [k("staff", "r", { tint: GOLD })], show: ["Badge_Shield"], attack: "melee1h", cast: "Spellcast_Summon", aura: "sand",
  },
  isis: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#f1ead8", secondary: "#2348a8", skin: "#c98e5e", leather: "#1d1b20" },
    acc: [{ kind: "wingsFeather", color: "#2348a8", color2: GOLD }, { kind: "sunDisc", color: "#ff7a3a", scale: 0.8, pos: [0, 0.1, 0] }], show: ["1H_Wand"], attack: "magic", cast: "Spellcast_Raise", aura: "stars",
  },
  set: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: "#7a1f1a", secondary: "#1d1b20", skin: "#a8442a" },
    acc: [{ kind: "snoutJackal", color: "#7a2a1f" }, { kind: "earsSet" }], props: [q("axe_double", "r", 0.3)], scale: 1.08, attack: "melee2h", cast: "2H_Melee_Attack_Spinning", aura: "sand",
  },
  ra: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#f6e3b0", secondary: GOLD, skin: "#c98e5e" },
    acc: [{ kind: "beak", color: "#e8a63a" }, { kind: "sunDisc", scale: 1.25, pos: [0, 0.25, 0] }, { kind: "nemes", color: "#2348a8" }], show: ["2H_Staff"], scale: 1.08, attack: "magic", cast: "Spellcast_Raise", aura: "embers",
  },

  // ================================================================ Japon
  kitsune: {
    body: "fox", matColors: { Main: "#f4ede0", Main_Light: "#ffffff", Grey: "#e8d4b0", Black: "#d8a03a" },
    acc: [{ kind: "tails", bone: "Body", pos: [0, 0.6, -1.8], scale: 1.8 }], attack: "magic", aura: "wisps",
  },
  tengu: {
    body: "rogue", palette: { primary: "#22222a", secondary: "#c8322c", skin: "#c8322c", leather: "#22222a" },
    acc: [{ kind: "snoutLong" }, { kind: "wingsRaven" }], props: [q("katana", "r", 0.42)], attack: "melee1h", cast: "1H_Melee_Attack_Slice_Horizontal", aura: "leaves",
  },
  kappa: {
    body: "rogue", palette: { primary: "#2f6f5a", secondary: "#c9b06a", skin: "#6faa5a", leather: "#3f6a3a" },
    acc: [{ kind: "plate" }, { kind: "shell" }, { kind: "beak", color: "#d8c04a", scale: 0.7 }], show: ["Knife"], attack: "melee1h", cast: "Dodge_Forward", aura: "water",
  },
  raijin: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: "#2f3a6e", secondary: "#e8c13a", skin: "#3f6fd0" },
    acc: [{ kind: "drumRing" }, { kind: "hornsDemon" }], attack: "magic", cast: "Spellcast_Raise", aura: "lightning",
  },
  susanoo: {
    body: "knight", hide: ["Knight_Helmet"], palette: { primary: "#23305a", secondary: "#e8c13a", metal: "#3a3f4a" },
    acc: [{ kind: "kabuto" }], props: [q("katana", "r", 0.5)], scale: 1.05, attack: "melee2h", cast: "2H_Melee_Attack_Spin", aura: "water",
  },
  yukionna: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#f4f8ff", secondary: "#9fd4ff", skin: "#dfe8f6", leather: "#1a1a24" },
    acc: [{ kind: "veil", color: "#dff0ff" }, { kind: "hairBun", color: "#1a1a24" }], attack: "magic", cast: "Spellcast_Long", aura: "snow",
  },
  orochi: {
    body: "snake_angry", heads: 8, matColors: { DarkGreen: "#5a1a1a", LightGreen: "#a83a2a", Purple: "#2a1a2a", Yellow: "#ffcf3a" }, scale: 1.05, attack: "bite", aura: "smoke",
  },

  // ================================================================ Chine
  zhubajie: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: "#22222a", secondary: GOLD, skin: "#e8a0a8" },
    acc: [{ kind: "snoutPig" }, { kind: "earsPig" }], props: [q("scythe", "r", 0.3, { tint: "#d0b080" })], scale: 1.08, attack: "melee2h", cast: "2H_Melee_Attack_Chop",
  },
  jiangshi: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#1f2a5a", secondary: "#c21f2a", skin: "#a8c0a8" },
    acc: [{ kind: "qingHat" }], attack: "unarmed", cast: "Spellcast_Shoot", aura: "smoke",
  },
  nezha: {
    body: "rogue", palette: { primary: "#c21f2a", secondary: GOLD, skin: "#f2c9a5", leather: "#2a1a1a" },
    acc: [{ kind: "fireWheels" }, { kind: "hairBun", color: "#1a1414" }], props: [q("spear", "r", 0.22), ], attack: "melee1h", cast: "2H_Melee_Attack_Spinning", aura: "embers",
  },
  shawujing: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: "#6a4a2a", secondary: "#3fa36f", skin: "#7a9ab8" },
    acc: [{ kind: "necklace", color: "#efe6cf", color2: "#efe6cf" }, { kind: "beard", color: "#c43a2a" }], props: [k("skel_staff", "r")], attack: "melee2h", cast: "Block", aura: "water",
  },
  houyi: {
    body: "knight", hide: ["Knight_Helmet"], palette: { primary: "#c21f2a", secondary: GOLD, metal: GOLD },
    acc: [{ kind: "hairBun", color: "#1a1414" }, { kind: "circlet", color: GOLD }], props: [q("bow_golden", "l", 0.32)], attack: "bow", cast: "1H_Ranged_Shoot", aura: "embers",
  },
  erlangshen: {
    body: "knight", hide: ["Knight_Helmet"], palette: { primary: "#3a4a6a", secondary: GOLD, metal: "#d8dee6" },
    acc: [{ kind: "thirdEye" }, { kind: "crown", color: "#d8dee6", color2: "#3fa9f5" }], props: [{ id: "q_spear", hand: "r", scale: 0.26 }], attack: "melee1h", cast: "1H_Melee_Attack_Stab", aura: "stars",
  },
  wukong: {
    body: "rogue", palette: { primary: "#c8322c", secondary: GOLD, skin: "#c98e5e", leather: "#8a5a2a" },
    acc: [{ kind: "circlet" }, { kind: "monkeyTail" }, { kind: "earsRound", color: "#c98e5e" }], props: [k("staff", "r", { tint: GOLD, glow: "#ffcf4a" })], scale: 1.05, attack: "melee2h", cast: "2H_Melee_Attack_Spinning", aura: "sparks",
  },

  // ================================================================ Celtes
  selkie: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#3a6a8a", secondary: "#9aa7b5", skin: "#e8dccf", leather: "#4a4a52" },
    acc: [{ kind: "veil", color: "#7a8a96" }], show: ["1H_Wand"], attack: "magic", cast: "Spellcast_Raise", aura: "water",
  },
  cuchulainn: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: "#3f8f4a", secondary: "#c0c8d0", skin: "#f2d0b4", leather: "#c4552a" },
    acc: [{ kind: "hornsDemon", color: "#c4552a", scale: 0.8 }], props: [q("spear", "r", 0.26, { tint: "#ff8a7a" })], show: ["Barbarian_Round_Shield"], attack: "melee1h", cast: "Throw", aura: "embers",
  },
  morrigan: {
    body: "rogue_hooded", palette: { primary: "#16151c", secondary: "#5a2a7a", skin: "#d8d0e0", leather: "#16151c" },
    acc: [{ kind: "wingsRaven" }], attack: "magic", cast: "Spellcast_Summon", aura: "shadow",
  },
  banshee: {
    body: "rogue_hooded", palette: { primary: "#d8e4f0", secondary: "#8aa0c0", skin: "#e8f0ff" }, ghost: true,
    acc: [{ kind: "veil", color: "#cfe0ff", pos: [0, 0.3, 0] }], attack: "magic", cast: "Spellcast_Long", aura: "wisps",
  },
  dagda: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: "#5a3a22", secondary: "#3f8f4a", skin: "#e8b48a", leather: "#8a5a2a" },
    acc: [{ kind: "beard", color: "#8a5a2a" }, { kind: "cauldron" }], props: [q("hammer_double", "r", 0.3, { tint: "#c49a6a" })], scale: 1.15, attack: "melee2h", cast: "Use_Item", aura: "leaves",
  },
  cernunnos: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#3f6a2a", secondary: "#8a5a2a", skin: "#c99a6a", leather: "#5a3a22" },
    acc: [{ kind: "antlers" }, { kind: "necklace", color: "#c9a04a", color2: "#7aff8a" }], show: ["2H_Staff"], attack: "magic", cast: "Spellcast_Summon", aura: "leaves",
  },
  lugh: {
    body: "knight", hide: ["Knight_Helmet"], palette: { primary: "#e8c13a", secondary: "#3f8f4a", metal: GOLD },
    acc: [{ kind: "halo" }, { kind: "laurel", color: GOLD }], props: [q("spear", "r", 0.28, { tint: "#ffe08a", glow: "#ffd23a" })], scale: 1.05, attack: "thrown", cast: "Throw", aura: "sparks",
  },

  // ================================================================ Aztèques
  xolotl: {
    body: "husky", matColors: { Material: "#3a3a44", "Material.001": "#2a2a30", "Material.002": "#1fa59a", "Material.003": "#ff7a3a", "Material.006": "#5a5a66" }, attack: "bite", aura: "shadow",
  },
  jaguar: {
    body: "rogue", palette: { primary: "#e3a93a", secondary: "#1fa59a", skin: "#a86a3a", leather: "#1d1712" },
    acc: [{ kind: "jaguarHelm" }], props: [k("sword_1handed", "r", { tint: "#3a3040" }), k("dagger", "l", { tint: "#3a3040" })], attack: "dual", cast: "Dualwield_Melee_Attack_Stab",
  },
  tlaloc: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#1f7ac8", secondary: "#1fa59a", skin: "#c98e5e" },
    acc: [{ kind: "goggles" }, { kind: "featherHeaddress", color: "#1f7ac8", color2: "#7ad0ff" }], props: [{ id: "q_spear", hand: "r", scale: 0.2, tint: "#7ad0ff" }], attack: "magic", cast: "Spellcast_Raise", aura: "water",
  },
  huitzilopochtli: {
    body: "knight", hide: ["Knight_Helmet"], palette: { primary: "#1f5ac8", secondary: GOLD, metal: GOLD },
    acc: [{ kind: "featherHeaddress", color: "#1fa5c8", color2: "#3cae5a" }], props: [q("bow_evil", "l", 0.3, { tint: "#ff8a3a" })], attack: "bow", cast: "1H_Ranged_Shoot", aura: "embers",
  },
  mictlantecuhtli: {
    body: "skeleton_mage", hide: ["Skeleton_Mage_Hat"], palette: { primary: "#17151c", secondary: "#c8392c" }, eyes: "#ff5a3a",
    acc: [{ kind: "featherHeaddress", color: "#17151c", color2: "#c8392c" }], props: [k("skel_staff", "r")], attack: "magic", cast: "Spellcast_Summon", aura: "smoke",
  },
  quetzalcoatl: {
    body: "snake", matColors: { DarkGreen: "#1f8a6a", LightGreen: "#3cd8a0", Purple: "#e8c13a", Yellow: "#ff5a3a" }, scale: 1.25,
    acc: [{ kind: "wingsFeather", bone: "Chest", color: "#1fa59a", color2: "#e8c13a", pos: [0, 0.2, 0], scale: 0.9 }, { kind: "featherHeaddress", bone: "Head", color: "#e8c13a", color2: "#c8392c", scale: 0.8, rot: [-1.2, 0, 0], pos: [0, 0.2, -0.3] }], attack: "magic", aura: "leaves",
  },
  tezcatlipoca: {
    body: "rogue_hooded", palette: { primary: "#17151c", secondary: "#e8c13a", skin: "#8a5a3a", leather: "#17151c" },
    acc: [{ kind: "facePaint", pos: [0, 0.02, 0.02] }, { kind: "mirror" }, { kind: "featherHeaddress", color: "#17151c", color2: "#e8c13a", scale: 0.8 }], show: ["Knife", "Knife_Offhand"], scale: 1.05, attack: "dual", cast: "Spellcast_Shoot", aura: "smoke",
  },

  // ================================================================ Mésopotamie
  lamassu: {
    body: "bull", matColors: { Main: "#c9a86a", Main_Light: "#e8d4a0", Horns: GOLD, Muzzle: "#8a6a4a", Hooves: "#3a2a1a" }, scale: 0.95,
    acc: [{ kind: "wingsFeather", bone: "Body", color: GOLD, color2: "#2347a0", pos: [0, 1.0, 0.6], scale: 1.6 }, { kind: "hornedCap", bone: "Head", scale: 1.4, rot: [-1.0, 0, 0], pos: [0, -0.5, 0.6] }], attack: "bite", aura: "sand",
  },
  enkidu: {
    body: "barbarian", hide: ["Barbarian_Hat", "Barbarian_Cape"], palette: { primary: "#6a4a2a", secondary: "#8a6a4a", skin: "#a8724a", leather: "#3a2a1a" },
    acc: [{ kind: "beard", color: "#3a2a1a" }, { kind: "hornsBull", color: "#d8c8a8", scale: 0.6 }], attack: "unarmed", cast: "Unarmed_Melee_Attack_Kick", aura: "leaves",
  },
  girtablilu: {
    body: "rogue", palette: { primary: "#5a3a22", secondary: "#c08a3a", skin: "#a8724a", leather: "#3a2a1a" },
    acc: [{ kind: "scorpionTail" }], show: ["2H_Crossbow"], attack: "crossbow", cast: "2H_Ranged_Shoot", aura: "sand",
  },
  ishtar: {
    body: "mage", hide: ["Mage_Hat"], palette: { primary: "#2347a0", secondary: GOLD, skin: "#d8a07a", leather: "#1a1414" },
    acc: [{ kind: "starCrown" }, { kind: "wingsFeather", color: "#2347a0", color2: GOLD, scale: 0.75 }], props: [q("bow_golden", "l", 0.3)], attack: "bow", cast: "1H_Ranged_Shoot", aura: "stars",
  },
  tiamat: {
    body: "trex", matColors: { Green: "#1f3f7a", LightGreen: "#2f8ac8", LightYellow: "#9fe0ff", Red: "#ff3a6a", Black: "#0a0a14" }, scale: 1.1,
    acc: [{ kind: "wingsBat", bone: "Body", color: "#1a2a5a", pos: [0, 0, 0], scale: 7 }, { kind: "hornsDemon", bone: "Head", scale: 5, rot: [-1.2, 0, 0], pos: [0, -2, 1] }], attack: "bite", aura: "water",
  },
  marduk: {
    body: "knight", hide: ["Knight_Helmet"], palette: { primary: "#2347a0", secondary: GOLD, metal: GOLD },
    acc: [{ kind: "hornedCap" }, { kind: "beard", color: "#1a1414" }], show: ["1H_Sword", "Spike_Shield"], scale: 1.05, attack: "melee1h", cast: "Spellcast_Raise", aura: "lightning",
  },
  gilgamesh: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: GOLD, secondary: "#2347a0", skin: "#c98e5e", leather: "#1a1414" },
    acc: [{ kind: "crown" }, { kind: "beard", color: "#1a1414" }], props: [q("sword_golden", "r", 0.36)], scale: 1.1, attack: "melee2h", cast: "2H_Melee_Attack_Slice", aura: "sparks",
  },

  // ================================================================ Monstres (rounds PvE)
  wolf: { body: "wolf", matColors: { Main: "#6a6058", Main_Light: "#a89a8a" }, attack: "bite" },
  harpy: {
    body: "rogue_hooded", palette: { primary: "#5a4a6a", secondary: "#8a7a9a", skin: "#c8b0a0", leather: "#3a2a3a" },
    acc: [{ kind: "wingsFeather", color: "#4a3a5a", color2: "#9a8aaa" }, { kind: "beak", color: "#d8b03a" }], attack: "magic", cast: "Spellcast_Shoot",
  },
  minotaur: {
    body: "barbarian", hide: ["Barbarian_Hat"], palette: { primary: "#5a3a22", secondary: "#8a6a4a", skin: "#7a4a2a", leather: "#2a1a10" },
    acc: [{ kind: "hornsBull" }, { kind: "snoutPig", color: "#5a3020", scale: 1.3 }], show: ["2H_Axe"], scale: 1.25, attack: "melee2h", cast: "2H_Melee_Attack_Chop",
  },
  hydra: { body: "snake", heads: 5, matColors: { DarkGreen: "#2a5a2a", LightGreen: "#6aa83a" }, scale: 1.1, attack: "bite" },
  jormungandr: { body: "snake_angry", matColors: { DarkGreen: "#1f4a4a", LightGreen: "#3a8a7a", Purple: "#1a2a3a" }, scale: 1.7, attack: "bite", aura: "water" },
};

/** Apparence par défaut pour un identifiant inconnu (nouvelle unité pas encore habillée). */
export const FALLBACK: CharSpec = { body: "skeleton_minion", attack: "melee1h", props: [k("skel_blade", "r")] };

export function specFor(defId: string): CharSpec {
  return CHARACTERS[defId] ?? FALLBACK;
}
