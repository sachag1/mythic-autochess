// Présages : au début de chaque partie, 3 présages sont proposés et les joueurs votent.
// Le présage retenu, annoncé par une figure mythologique, change les règles pour tout le
// monde. Comme les rencontres et les portails de TFT : chaque partie a sa propre saveur.
import { TRAITS, type Rng } from "@autochess/sim";
import { DEFAULT_RULES, type GameRules } from "./rules.js";

export interface OmenDef {
  id: string;
  name: string;
  /** Figure qui annonce le présage (id d'unité, pour l'afficher en 3D). */
  herald: string;
  description: string;
  /** Modifie les règles ; peut tirer au sort (ex. : un panthéon favori). */
  apply: (rules: GameRules, rng: Rng) => { rules: GameRules; detail?: string };
}

const PANTHEONS = TRAITS.filter((t) => t.kind === "origin");

export const OMENS: readonly OmenDef[] = [
  {
    id: "hermes_bargain",
    name: "Hermes' Bargain",
    herald: "hades",
    description: "The first reroll of every round is free.",
    apply: (rules) => ({ rules: { ...rules, freeRerollsPerRound: 1 } }),
  },
  {
    id: "nibelung_hoard",
    name: "Hoard of the Nibelungs",
    herald: "fenrir",
    description: "Everyone earns 1 extra gold every round.",
    apply: (rules) => ({ rules: { ...rules, bonusGoldPerRound: 1 } }),
  },
  {
    id: "odin_wisdom",
    name: "Odin's Wisdom",
    herald: "valkyrie",
    description: "Buying experience costs 3 gold instead of 4.",
    apply: (rules) => ({ rules: { ...rules, xpCost: 3 } }),
  },
  {
    id: "ziggurat_treasury",
    name: "Treasury of Babylon",
    herald: "gilgamesh",
    description: "Interest is capped at 7 gold instead of 5.",
    apply: (rules) => ({ rules: { ...rules, interestCap: 7 } }),
  },
  {
    id: "hephaestus_forge",
    name: "Forge of Hephaestus",
    herald: "cyclops",
    description: "At the start of stage 2, everyone receives a completed item.",
    apply: (rules) => ({ rules: { ...rules, completedItemAtStage: 2 } }),
  },
  {
    id: "bounty_of_isis",
    name: "Bounty of Isis",
    herald: "isis",
    description: "PvE rounds drop one extra component.",
    apply: (rules) => ({ rules: { ...rules, extraPveComponents: 1 } }),
  },
  {
    id: "divine_armory",
    name: "Armory of the Gods",
    herald: "athena",
    description: "From stage 3, the armory offers completed items.",
    apply: (rules) => ({ rules: { ...rules, armoryCompletedFromStage: 3 } }),
  },
  {
    id: "thor_storm",
    name: "Thor's Storm",
    herald: "thor",
    description: "Every unit gains 15% attack speed.",
    apply: (rules) => ({ rules: { ...rules, combatModifiers: [...rules.combatModifiers, { stats: { attackSpeedPct: 15 } }] } }),
  },
  {
    id: "ra_zenith",
    name: "Zenith of Ra",
    herald: "ra",
    description: "Every unit gains 20 ability power and 10 starting mana.",
    apply: (rules) => ({
      rules: { ...rules, combatModifiers: [...rules.combatModifiers, { stats: { abilityPower: 20, startMana: 10 } }] },
    }),
  },
  {
    id: "favored_pantheon",
    name: "Favor of the Pantheon",
    herald: "zeus",
    description: "One pantheon is favored this game: its units gain 200 health and 15 ability power.",
    apply: (rules, rng) => {
      const pantheon = PANTHEONS[rng.int(PANTHEONS.length)]!;
      return {
        rules: {
          ...rules,
          combatModifiers: [...rules.combatModifiers, { filter: { traits: [pantheon.id] }, stats: { maxHp: 200, abilityPower: 15 } }],
        },
        detail: pantheon.id,
      };
    },
  },
  {
    id: "fates_thread",
    name: "Thread of the Fates",
    herald: "morrigan",
    description: "5-cost units can appear from level 6, and appear more often at levels 7 and 8.",
    apply: (rules) => ({
      rules: {
        ...rules,
        shopOdds: { ...rules.shopOdds, 6: [29, 39, 25, 5, 2], 7: [18, 28, 34, 15, 5], 8: [16, 24, 30, 22, 8] },
      },
    }),
  },
  {
    id: "ragnarok",
    name: "Ragnarök",
    herald: "orochi",
    description: "From stage 4, players take 50% more damage. Games are shorter and bolder.",
    apply: (rules) => ({ rules: { ...rules, damageMultiplier: { fromStage: 4, multiplier: 1.5 } } }),
  },
];

export const OMENS_BY_ID = new Map(OMENS.map((o) => [o.id, o]));

/** Tire 3 présages différents à proposer au vote. */
export function drawOmenChoices(rng: Rng, count = 3): string[] {
  const pool = [...OMENS];
  const out: string[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(rng.int(pool.length), 1)[0]!.id);
  return out;
}

/** Comme les portails de TFT : tirage au sort pondéré par les votes (chaque choix garde 1 chance). */
export function resolveOmenVote(choices: readonly string[], votes: readonly string[], rng: Rng): string {
  const weights = choices.map((c) => 1 + votes.filter((v) => v === c).length);
  let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < choices.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return choices[i]!;
  }
  return choices.at(-1)!;
}

export function rulesForOmen(omenId: string, rng: Rng): { rules: GameRules; detail?: string } {
  const omen = OMENS_BY_ID.get(omenId);
  if (!omen) throw new Error(`Unknown omen "${omenId}"`);
  return omen.apply(structuredClone(DEFAULT_RULES), rng);
}
