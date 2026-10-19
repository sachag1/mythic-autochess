// Augments : 3 choix par partie (rounds 2-1, 3-2 et 4-2), comme dans TFT. À chaque choix,
// le joueur voit 3 augments de la même rareté (argent, or ou prismatique) et peut relancer
// la proposition une fois. Équité : la rareté de chaque choix est la même pour tous les
// joueurs de la partie (tirée au début).
import type { Modifier, TriggerDef } from "@autochess/sim";

export type AugmentTier = "silver" | "gold" | "prismatic";

export interface AugmentDef {
  id: string;
  name: string;
  tier: AugmentTier;
  description: string;
  /** Effet immédiat au moment du choix. */
  onPick?: {
    gold?: number;
    xp?: number;
    components?: number;
    completedItems?: number;
    /** Unités offertes ; `star: 2` prend 3 exemplaires dans le pool. */
    units?: { cost: number; count: number; star?: 1 | 2 };
    heal?: number;
  };
  /** Bonus à chaque phase de préparation. */
  perRound?: { gold?: number; xp?: number; freeRerolls?: number };
  interestCapBonus?: number;
  /** Bonus de combat pour l'équipe du joueur. */
  combat?: Modifier[];
}

/** Rounds où l'on choisit un augment : [étape, round]. */
export const AUGMENT_ROUNDS: readonly (readonly [number, number])[] = [
  [2, 1],
  [3, 2],
  [4, 2],
];

/** Suites de raretés possibles pour une partie (même suite pour tout le monde). */
export const TIER_PATTERNS: readonly (readonly AugmentTier[])[] = [
  ["silver", "gold", "gold"],
  ["gold", "gold", "gold"],
  ["silver", "silver", "gold"],
  ["gold", "silver", "gold"],
  ["silver", "gold", "prismatic"],
  ["gold", "gold", "prismatic"],
  ["gold", "prismatic", "gold"],
  ["prismatic", "gold", "gold"],
  ["silver", "silver", "prismatic"],
];

const FRONTLINE = ["guardian", "beast", "warrior"];

const onStart = (effects: TriggerDef["effects"]): TriggerDef => ({ on: "combatStart", target: "self", effects });

export const AUGMENTS: readonly AugmentDef[] = [
  // ------------------------------------------------------------------ argent
  { id: "charon_obol", name: "Obol of Charon", tier: "silver", description: "Gain 9 gold.", onPick: { gold: 9 } },
  { id: "hermes_sandals", name: "Sandals of Hermes", tier: "silver", description: "Gain 2 experience now and 1 extra experience every round.", onPick: { xp: 2 }, perRound: { xp: 1 } },
  { id: "lucky_scarab", name: "Lucky Scarab", tier: "silver", description: "Gain 1 extra gold every round.", perRound: { gold: 1 } },
  { id: "smith_satchel", name: "Smith's Satchel", tier: "silver", description: "Gain 3 random components.", onPick: { components: 3 } },
  { id: "nectar_ration", name: "Nectar Ration", tier: "silver", description: "Heal 15 player health and gain 4 gold.", onPick: { heal: 15, gold: 4 } },
  {
    id: "hoplite_drill",
    name: "Hoplite Drill",
    tier: "silver",
    description: "Your Guardians, Beasts and Warriors gain 20 armor and 20 magic resist.",
    combat: [{ filter: { traits: FRONTLINE }, stats: { armor: 20, magicResist: 20 } }],
  },
  {
    id: "archer_focus",
    name: "Archer's Focus",
    tier: "silver",
    description: "Your Hunters and Tricksters gain 25% attack speed and 15% critical strike chance.",
    combat: [{ filter: { traits: ["hunter", "trickster"] }, stats: { attackSpeedPct: 25, critChance: 0.15 } }],
  },
  { id: "spark_of_prometheus", name: "Spark of Prometheus", tier: "silver", description: "Your units gain 15 ability power.", combat: [{ stats: { abilityPower: 15 } }] },
  { id: "bronze_skin", name: "Bronze Skin", tier: "silver", description: "Your units gain 100 health.", combat: [{ stats: { maxHp: 100 } }] },
  {
    id: "war_horn",
    name: "War Horn of Gjallar",
    tier: "silver",
    description: "Your units gain 30% attack speed for the first 5 seconds of combat.",
    combat: [{ triggers: [onStart([{ kind: "buff", stat: "attackSpeedPct", amount: [30, 30, 30], durationMs: 5000, area: { shape: "self" } }])] }],
  },
  { id: "oracle_dream", name: "Oracle's Dream", tier: "silver", description: "Your units start combat with 18 extra mana.", combat: [{ stats: { startMana: 18 } }] },
  {
    id: "village_heroes",
    name: "Village Heroes",
    tier: "silver",
    description: "Your 1-cost and 2-cost units gain 100 health and 6 attack damage.",
    combat: [{ filter: { costs: [1, 2] }, stats: { maxHp: 100, attackDamage: 6 } }],
  },
  {
    id: "first_light",
    name: "First Light",
    tier: "silver",
    description: "Your units start combat with a 120 shield for 4 seconds.",
    combat: [{ triggers: [onStart([{ kind: "shield", amount: [120, 120, 120], scaling: "none", durationMs: 4000, area: { shape: "self" } }])] }],
  },

  // ------------------------------------------------------------------ or
  { id: "golden_hoard", name: "Hoard of Fafnir", tier: "gold", description: "Gain 18 gold.", onPick: { gold: 18 } },
  { id: "hermes_wings", name: "Wings of Hermes", tier: "gold", description: "Gain 4 extra experience every round.", perRound: { xp: 4 } },
  { id: "odin_ravens", name: "Huginn and Muninn", tier: "gold", description: "Your first reroll every round is free.", perRound: { freeRerolls: 1 } },
  { id: "babylon_vault", name: "Vault of Babylon", tier: "gold", description: "Gain 10 gold. Your interest cap is raised by 3.", onPick: { gold: 10 }, interestCapBonus: 3 },
  { id: "forge_of_vulcan", name: "Forge of Vulcan", tier: "gold", description: "Gain a random completed item and 2 random components.", onPick: { completedItems: 1, components: 2 } },
  { id: "recruits_of_sparta", name: "Recruits of Sparta", tier: "gold", description: "Gain a random 3-cost unit at 2 stars.", onPick: { units: { cost: 3, count: 1, star: 2 } } },
  { id: "aegis_wall", name: "Wall of Aegis", tier: "gold", description: "Your units gain 20 armor and 20 magic resist.", combat: [{ stats: { armor: 20, magicResist: 20 } }] },
  { id: "berserker_rage", name: "Berserkergang", tier: "gold", description: "Your units gain 20% attack speed.", combat: [{ stats: { attackSpeedPct: 20 } }] },
  { id: "arcane_surge", name: "Wisdom of Thoth", tier: "gold", description: "Your units gain 25 ability power.", combat: [{ stats: { abilityPower: 25 } }] },
  { id: "titan_blood", name: "Blood of the Titans", tier: "gold", description: "Your units gain 170 health.", combat: [{ stats: { maxHp: 170 } }] },
  { id: "ichor", name: "Ichor", tier: "gold", description: "Your units gain 12% omnivamp.", combat: [{ stats: { omnivamp: 12 } }] },
  {
    id: "valhalla_call",
    name: "Call of Valhalla",
    tier: "gold",
    description: "Each time an ally dies, your units heal 120 health.",
    combat: [{ triggers: [{ on: "onAllyDeath", target: "self", effects: [{ kind: "heal", amount: [120, 120, 120], scaling: "none", area: { shape: "self" } }] }] }],
  },
  {
    id: "thunderclap",
    name: "Thunderclap",
    tier: "gold",
    description: "Every 4th attack of your units strikes enemies around the target for 60 magic damage.",
    combat: [
      {
        triggers: [
          { on: "everyNAttacks", n: 4, target: "currentTarget", effects: [{ kind: "damage", damageType: "magic", amount: [60, 60, 60], scaling: "none", area: { shape: "radius", radius: 1 } }] },
        ],
      },
    ],
  },
  {
    id: "crown_of_the_humble",
    name: "Crown of the Humble",
    tier: "gold",
    description: "Your 1, 2 and 3-cost units gain 100 health, 8 attack damage and 8 ability power.",
    combat: [{ filter: { costs: [1, 2, 3] }, stats: { maxHp: 100, attackDamage: 8, abilityPower: 8 } }],
  },

  // ------------------------------------------------------------------ prismatique
  { id: "midas_touch", name: "Touch of Midas", tier: "prismatic", description: "Gain 32 gold.", onPick: { gold: 32 } },
  { id: "cornucopia", name: "Cornucopia", tier: "prismatic", description: "Gain 3 random completed items.", onPick: { completedItems: 3 } },
  {
    id: "golden_age",
    name: "Golden Age",
    tier: "prismatic",
    description: "Every round, gain 2 extra gold and your first reroll is free.",
    perRound: { gold: 2, freeRerolls: 1 },
  },
  { id: "thoth_tablets", name: "Emerald Tablets", tier: "prismatic", description: "Gain 20 experience now and 2 extra experience every round.", onPick: { xp: 20 }, perRound: { xp: 2 } },
  { id: "divine_summons", name: "Divine Summons", tier: "prismatic", description: "Gain a random 4-cost unit at 2 stars.", onPick: { units: { cost: 4, count: 1, star: 2 } } },
  {
    id: "twilight_of_gods",
    name: "Twilight of the Gods",
    tier: "prismatic",
    description: "Every 6 seconds of combat, your units permanently deal 30% more damage.",
    combat: [{ triggers: [{ on: "interval", everyMs: 6000, target: "self", effects: [{ kind: "buff", stat: "damageAmp", amount: [30, 30, 30], area: { shape: "self" } }] }] }],
  },
  { id: "elixir_of_life", name: "Elixir of Life", tier: "prismatic", description: "Your units gain 180 health and 10% omnivamp.", combat: [{ stats: { maxHp: 180, omnivamp: 10 } }] },
  {
    id: "wrath_of_zeus",
    name: "Wrath of Zeus",
    tier: "prismatic",
    description: "Every 3rd attack of your units calls lightning on enemies around the target for 110 magic damage.",
    combat: [
      {
        triggers: [
          { on: "everyNAttacks", n: 3, target: "currentTarget", effects: [{ kind: "damage", damageType: "magic", amount: [110, 110, 110], scaling: "none", area: { shape: "radius", radius: 1 } }] },
        ],
      },
    ],
  },
  {
    id: "olympus_favor",
    name: "Favor of Olympus",
    tier: "prismatic",
    description: "Your 3, 4 and 5-cost units gain 300 health, 35% attack speed and 35 ability power.",
    combat: [{ filter: { costs: [3, 4, 5] }, stats: { maxHp: 300, attackSpeedPct: 35, abilityPower: 35 } }],
  },
  {
    id: "legion_of_heroes",
    name: "Legion of Heroes",
    tier: "prismatic",
    description: "Your 1-cost and 2-cost units gain 220 health, 14 attack damage and 14 ability power.",
    combat: [{ filter: { costs: [1, 2] }, stats: { maxHp: 220, attackDamage: 14, abilityPower: 14 } }],
  },
  {
    id: "immortal_aegis",
    name: "Immortal Aegis",
    tier: "prismatic",
    description: "Your units start combat with a 400 shield for 8 seconds.",
    combat: [{ triggers: [onStart([{ kind: "shield", amount: [400, 400, 400], scaling: "none", durationMs: 8000, area: { shape: "self" } }])] }],
  },
  {
    id: "yggdrasil",
    name: "Yggdrasil",
    tier: "prismatic",
    description: "Every 3 seconds, your units heal 90 health.",
    combat: [{ triggers: [{ on: "interval", everyMs: 3000, target: "self", effects: [{ kind: "heal", amount: [90, 90, 90], scaling: "none", area: { shape: "self" } }] }] }],
  },
];

export const AUGMENTS_BY_ID = new Map(AUGMENTS.map((a) => [a.id, a]));
