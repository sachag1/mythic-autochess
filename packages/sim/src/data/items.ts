import type { AreaDef, EffectDef, ItemDef } from "../types.js";
import { flat } from "./balance.js";

// 8 composants de base, combinables deux à deux en 36 objets complets (artefacts mythiques
// de tous les panthéons). Chaque paire de composants, doublons compris, donne exactement un
// objet. Rôles couverts : carrys physiques et magiques, tanks, soutiens et utilitaires
// (anti-soin, réduction de résistances, mana, contrôle, protection de l'équipe).

const self = { shape: "self" } as const;
const single = { shape: "single" } as const;
const radius = (r: number) => ({ shape: "radius", radius: r }) as const;

const shield = (amount: number, durationMs: number, area: AreaDef = self): EffectDef => ({
  kind: "shield",
  amount: flat(amount),
  scaling: "none",
  durationMs,
  area,
});

export const ITEMS: readonly ItemDef[] = [
  // ------------------------------------------------------------------ composants
  { id: "sword", name: "Bronze Sword", description: "+12 attack damage.", stats: { attackDamage: 12 } },
  { id: "bow", name: "Yew Bow", description: "+12% attack speed.", stats: { attackSpeedPct: 12 } },
  { id: "rod", name: "Oak Wand", description: "+15 ability power.", stats: { abilityPower: 15 } },
  { id: "tear", name: "Sacred Water", description: "+15 starting mana.", stats: { startMana: 15 } },
  { id: "vest", name: "Bronze Breastplate", description: "+20 armor.", stats: { armor: 20 } },
  { id: "cloak", name: "Woven Cloak", description: "+20 magic resist.", stats: { magicResist: 20 } },
  { id: "belt", name: "Leather Belt", description: "+150 health.", stats: { maxHp: 150 } },
  { id: "glove", name: "Hunter's Glove", description: "+15% critical strike chance.", stats: { critChance: 0.15 } },

  // ------------------------------------------------------------------ épée (dégâts physiques)
  {
    id: "kusanagi",
    name: "Kusanagi",
    description: "Each takedown permanently grants 10 attack damage.",
    components: ["sword", "sword"],
    stats: { attackDamage: 32 },
    triggers: [{ on: "onKill", target: "self", effects: [{ kind: "buff", stat: "attackDamage", amount: flat(10), area: self }] }],
  },
  {
    id: "gungnir",
    name: "Gungnir",
    description: "Every third attack deals 70 bonus true damage.",
    components: ["sword", "bow"],
    stats: { attackDamage: 15, attackSpeedPct: 15 },
    triggers: [{ on: "everyNAttacks", n: 3, target: "currentTarget", effects: [{ kind: "damage", damageType: "true", amount: flat(70), scaling: "none", area: single }] }],
  },
  {
    id: "ruyi_jingu_bang",
    name: "Ruyi Jingu Bang",
    description: "Heals for 15% of all damage dealt.",
    components: ["sword", "rod"],
    stats: { attackDamage: 12, abilityPower: 15, omnivamp: 15 },
  },
  {
    id: "spear_of_lugh",
    name: "Spear of Lugh",
    description: "Attacks grant 5 extra mana.",
    components: ["sword", "tear"],
    stats: { attackDamage: 12, startMana: 15 },
    triggers: [{ on: "everyNAttacks", n: 1, target: "self", effects: [{ kind: "mana", amount: flat(5), area: self }] }],
  },
  {
    id: "sharur",
    name: "Sharur",
    description: "The first time health falls below 50%, gains a shield of 15% max health and 15% attack speed.",
    components: ["sword", "vest"],
    stats: { attackDamage: 12, armor: 20 },
    triggers: [{ on: "hpBelow", percent: 50, target: "self", effects: [
      { kind: "shield", amount: flat(15), scaling: "maxHp", durationMs: 5000, area: self },
      { kind: "buff", stat: "attackSpeedPct", amount: flat(15), area: self },
    ] }],
  },
  {
    id: "gae_bulg",
    name: "Gáe Bulg",
    description: "Attacks inflict Wound: the target receives 40% less healing for 5 seconds.",
    components: ["sword", "cloak"],
    stats: { attackDamage: 15, magicResist: 20 },
    triggers: [{ on: "everyNAttacks", n: 1, target: "currentTarget", effects: [{ kind: "wound", percent: 40, durationMs: 5000, area: single }] }],
  },
  {
    id: "tyrfing",
    name: "Tyrfing",
    description: "The first time health falls below 60%, gains 400 max health and 40 attack damage.",
    components: ["sword", "belt"],
    stats: { attackDamage: 12, maxHp: 150 },
    triggers: [{ on: "hpBelow", percent: 60, target: "self", effects: [
      { kind: "buff", stat: "maxHp", amount: flat(400), area: self },
      { kind: "buff", stat: "attackDamage", amount: flat(40), area: self },
    ] }],
  },
  {
    id: "excalibur",
    name: "Excalibur",
    description: "+35% critical strike damage.",
    components: ["sword", "glove"],
    stats: { attackDamage: 15, critChance: 0.2, critDamage: 0.35 },
  },

  // ------------------------------------------------------------------ arc (vitesse d'attaque)
  {
    id: "fenghuo_lun",
    name: "Fenghuo Lun",
    description: "Each attack grants 4% attack speed for the rest of combat.",
    components: ["bow", "bow"],
    stats: { attackSpeedPct: 20 },
    triggers: [{ on: "everyNAttacks", n: 1, target: "self", effects: [{ kind: "buff", stat: "attackSpeedPct", amount: flat(4), area: self }] }],
  },
  {
    id: "mjolnir",
    name: "Mjolnir",
    description: "Every fourth attack strikes enemies around the target with lightning.",
    components: ["bow", "rod"],
    stats: { attackSpeedPct: 15, abilityPower: 15 },
    triggers: [{ on: "everyNAttacks", n: 4, target: "currentTarget", effects: [{ kind: "damage", damageType: "magic", amount: flat(80), scaling: "ap", area: radius(1) }] }],
  },
  {
    id: "trident",
    name: "Trident of Poseidon",
    description: "Every third attack deals 80 magic damage and restores 10 mana.",
    components: ["bow", "tear"],
    stats: { attackSpeedPct: 12, startMana: 15 },
    triggers: [{ on: "everyNAttacks", n: 3, target: "currentTarget", effects: [
      { kind: "damage", damageType: "magic", amount: flat(80), scaling: "ap", area: single },
      { kind: "mana", amount: flat(10), area: self },
    ] }],
  },
  {
    id: "yata_no_kagami",
    name: "Yata no Kagami",
    description: "When hit, gains 3 attack damage and 3 ability power (once every 0.75 s, up to 15 times).",
    components: ["bow", "vest"],
    stats: { attackSpeedPct: 12, armor: 20 },
    triggers: [{ on: "onDamageTaken", cooldownMs: 750, limit: 15, target: "self", effects: [
      { kind: "buff", stat: "attackDamage", amount: flat(3), area: self },
      { kind: "buff", stat: "abilityPower", amount: flat(3), area: self },
    ] }],
  },
  {
    id: "bow_of_hou_yi",
    name: "Bow of Hou Yi",
    description: "Each attack also looses an arrow at the farthest enemy for 50% attack damage.",
    components: ["bow", "cloak"],
    stats: { attackSpeedPct: 12, magicResist: 20 },
    triggers: [{ on: "everyNAttacks", n: 1, target: "farthestEnemy", effects: [{ kind: "damage", damageType: "physical", amount: flat(0.5), scaling: "ad", area: single }] }],
  },
  {
    id: "megingjord",
    name: "Megingjörð",
    description: "Attacks deal bonus magic damage equal to 4% of the wearer's max health.",
    components: ["bow", "belt"],
    stats: { attackSpeedPct: 15, maxHp: 150 },
    triggers: [{ on: "everyNAttacks", n: 1, target: "currentTarget", effects: [{ kind: "damage", damageType: "magic", amount: flat(4), scaling: "maxHp", area: single }] }],
  },
  {
    id: "harpe",
    name: "Harpe",
    description: "Attacks cut the target's armor by 40% for 4 seconds.",
    components: ["bow", "glove"],
    stats: { attackSpeedPct: 12, critChance: 0.15 },
    triggers: [{ on: "everyNAttacks", n: 1, target: "currentTarget", effects: [{ kind: "sunder", stat: "armor", percent: 40, durationMs: 4000, area: single }] }],
  },

  // ------------------------------------------------------------------ baguette (puissance)
  {
    id: "book_of_thoth",
    name: "Book of Thoth",
    description: "A large amount of ability power.",
    components: ["rod", "rod"],
    stats: { abilityPower: 55 },
  },
  {
    id: "ambrosia",
    name: "Ambrosia",
    description: "After casting, heals for 100.",
    components: ["rod", "tear"],
    stats: { abilityPower: 20, startMana: 15 },
    triggers: [{ on: "onCast", target: "self", effects: [{ kind: "heal", amount: flat(100), scaling: "ap", area: self }] }],
  },
  {
    id: "melammu",
    name: "Melammu",
    description: "At the start of combat, shields allies within 2 hexes for 150.",
    components: ["rod", "vest"],
    stats: { abilityPower: 15, armor: 20 },
    triggers: [{ on: "combatStart", target: "self", effects: [shield(150, 8000, radius(2))] }],
  },
  {
    id: "tablet_of_destinies",
    name: "Tablet of Destinies",
    description: "Enemies within 2 hexes have 40% less magic resist.",
    components: ["rod", "cloak"],
    stats: { abilityPower: 15, magicResist: 20 },
    triggers: [{ on: "interval", everyMs: 1000, target: "self", effects: [{ kind: "sunder", stat: "magicResist", percent: 40, durationMs: 1100, area: radius(2) }] }],
  },
  {
    id: "xiuhcoatl",
    name: "Xiuhcoatl",
    description: "After casting, burns the target and enemies next to it (1.2% max health per second) and wounds them for 6 seconds.",
    components: ["rod", "belt"],
    stats: { abilityPower: 15, maxHp: 150 },
    triggers: [{ on: "onCast", target: "currentTarget", effects: [
      { kind: "burn", percentMaxHp: 1.2, durationMs: 6000, area: radius(1) },
      { kind: "wound", percent: 40, durationMs: 6000, area: radius(1) },
    ] }],
  },
  {
    id: "smoking_mirror",
    name: "Smoking Mirror",
    description: "After casting, deals 20% more damage for 4 seconds.",
    components: ["rod", "glove"],
    stats: { abilityPower: 15, critChance: 0.15 },
    triggers: [{ on: "onCast", target: "self", effects: [{ kind: "buff", stat: "damageAmp", amount: flat(20), durationMs: 4000, area: self }] }],
  },

  // ------------------------------------------------------------------ eau sacrée (mana)
  {
    id: "cauldron_of_dagda",
    name: "Cauldron of the Dagda",
    description: "After casting, restores 20 mana.",
    components: ["tear", "tear"],
    stats: { startMana: 30 },
    triggers: [{ on: "onCast", target: "self", effects: [{ kind: "mana", amount: flat(20), area: self }] }],
  },
  {
    id: "imhullu",
    name: "Imhullu",
    description: "Every 2 seconds, enemies within 2 hexes lose 25% attack speed for 2 seconds.",
    components: ["tear", "vest"],
    stats: { startMana: 15, armor: 20 },
    triggers: [{ on: "interval", everyMs: 2000, target: "self", effects: [
      { kind: "buff", stat: "attackSpeedPct", amount: flat(-25), durationMs: 2000, area: radius(2), affects: "enemies" },
    ] }],
  },
  {
    id: "lotus_lantern",
    name: "Lotus Lantern",
    description: "At the start of combat, the wearer and adjacent allies gain 20 ability power.",
    components: ["tear", "cloak"],
    stats: { startMana: 15, magicResist: 20 },
    triggers: [{ on: "combatStart", target: "self", effects: [{ kind: "buff", stat: "abilityPower", amount: flat(20), area: radius(1) }] }],
  },
  {
    id: "ankh",
    name: "Ankh",
    description: "The first time health falls below 50%, heals allies within 2 hexes for 300.",
    components: ["tear", "belt"],
    stats: { startMana: 15, maxHp: 150 },
    triggers: [{ on: "hpBelow", percent: 50, target: "self", effects: [{ kind: "heal", amount: flat(300), scaling: "none", area: radius(2) }] }],
  },
  {
    id: "draupnir",
    name: "Draupnir",
    description: "Attack damage, ability power and healing for 10% of damage dealt.",
    components: ["tear", "glove"],
    stats: { startMana: 15, critChance: 0.15, attackDamage: 10, abilityPower: 10, omnivamp: 10 },
  },

  // ------------------------------------------------------------------ cuirasse (armure)
  {
    id: "nemean_hide",
    name: "Nemean Lion Hide",
    description: "When hit, deals 60 magic damage to adjacent enemies (once every 1.5 s).",
    components: ["vest", "vest"],
    stats: { armor: 60 },
    triggers: [{ on: "onDamageTaken", cooldownMs: 1500, target: "self", effects: [{ kind: "damage", damageType: "magic", amount: flat(60), scaling: "none", area: radius(1) }] }],
  },
  {
    id: "aegis",
    name: "Aegis",
    description: "Starts combat with a 350 shield.",
    components: ["vest", "cloak"],
    stats: { armor: 35, magicResist: 35 },
    triggers: [{ on: "combatStart", target: "self", effects: [shield(350, 10000)] }],
  },
  {
    id: "svalinn",
    name: "Svalinn",
    description: "Every 2 seconds, burns adjacent enemies (1.2% max health per second) and wounds them.",
    components: ["vest", "belt"],
    stats: { armor: 20, maxHp: 150 },
    triggers: [{ on: "interval", everyMs: 2000, target: "self", effects: [
      { kind: "burn", percentMaxHp: 1.2, durationMs: 3000, area: radius(1) },
      { kind: "wound", percent: 40, durationMs: 3000, area: radius(1) },
    ] }],
  },
  {
    id: "chimalli",
    name: "Chimalli",
    description: "Takes 15% less damage.",
    components: ["vest", "glove"],
    stats: { armor: 25, critChance: 0.15, durability: 15 },
  },

  // ------------------------------------------------------------------ cape (résistance magique)
  {
    id: "wedjat",
    name: "Eye of Horus",
    description: "Heals 3.5% max health every 2 seconds.",
    components: ["cloak", "cloak"],
    stats: { magicResist: 50 },
    triggers: [{ on: "interval", everyMs: 2000, target: "self", effects: [{ kind: "heal", amount: flat(3.5), scaling: "maxHp", area: self }] }],
  },
  {
    id: "tamatebako",
    name: "Tamatebako",
    description: "At the start of combat, stuns the farthest enemy for 3.5 seconds.",
    components: ["cloak", "belt"],
    stats: { magicResist: 20, maxHp: 200 },
    triggers: [{ on: "combatStart", target: "farthestEnemy", effects: [{ kind: "stun", durationMs: flat(3500), area: single }] }],
  },
  {
    id: "talaria",
    name: "Talaria",
    description: "Immune to stuns for the first 15 seconds of combat.",
    components: ["cloak", "glove"],
    stats: { magicResist: 25, critChance: 0.2, attackSpeedPct: 20 },
    triggers: [{ on: "combatStart", target: "self", effects: [{ kind: "immunity", durationMs: 15000, area: self }] }],
  },

  // ------------------------------------------------------------------ ceinture (PV) et gant (critique)
  {
    id: "golden_fleece",
    name: "Golden Fleece",
    description: "Heals 50 health every 2 seconds.",
    components: ["belt", "belt"],
    stats: { maxHp: 400 },
    triggers: [{ on: "interval", everyMs: 2000, target: "self", effects: [{ kind: "heal", amount: flat(50), scaling: "none", area: self }] }],
  },
  {
    id: "plant_of_heartbeat",
    name: "Plant of Heartbeat",
    description: "The first time health falls below 35%, heals 35% max health.",
    components: ["belt", "glove"],
    stats: { maxHp: 200, critChance: 0.15 },
    triggers: [{ on: "hpBelow", percent: 35, target: "self", effects: [{ kind: "heal", amount: flat(35), scaling: "maxHp", area: self }] }],
  },
  {
    id: "eye_of_ra",
    name: "Eye of Ra",
    description: "Critical strikes burn the target for 2% max health per second for 4 seconds.",
    components: ["glove", "glove"],
    stats: { critChance: 0.35, critDamage: 0.1 },
    triggers: [{ on: "onCrit", target: "currentTarget", effects: [{ kind: "burn", percentMaxHp: 2, durationMs: 4000, area: single }] }],
  },
];
