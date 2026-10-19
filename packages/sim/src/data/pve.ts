// Monstres des rounds PvE. Ils ne sont jamais dans la boutique.
import type { Placement, UnitDef } from "../types.js";
import { abilityValues, adRatio, durationValues, roleStats } from "./balance.js";

export const MONSTERS: readonly UnitDef[] = [
  // Étape 1 : des créatures volontairement inoffensives, n'importe quel personnage les bat.
  {
    id: "wolf_pup",
    name: "Wolf Pup",
    cost: 1,
    traits: [],
    stats: roleStats("bruiser", 1, { maxHp: -500, attackDamage: -48, armor: -30, magicResist: -30 }),
    ability: {
      name: "Nip",
      description: "A tiny bite.",
      target: "currentTarget",
      castTimeMs: 300,
      effects: [{ kind: "damage", damageType: "physical", amount: adRatio(1), scaling: "ad", area: { shape: "single" } }],
    },
  },
  {
    id: "harpy_chick",
    name: "Harpy Chick",
    cost: 1,
    traits: [],
    stats: roleStats("marksman", 1, { maxHp: -330, attackDamage: -45, armor: -15, magicResist: -15 }),
    ability: {
      name: "Squawk",
      description: "A shrill little cry.",
      target: "currentTarget",
      castTimeMs: 300,
      effects: [{ kind: "damage", damageType: "magic", amount: abilityValues(1, 20), scaling: "ap", area: { shape: "single" } }],
    },
  },
  {
    id: "wolf",
    name: "Dire Wolf",
    cost: 1,
    traits: [],
    stats: roleStats("bruiser", 1, { maxHp: -250, attackDamage: -20 }),
    ability: {
      name: "Bite",
      description: "A savage bite.",
      target: "currentTarget",
      castTimeMs: 300,
      effects: [{ kind: "damage", damageType: "physical", amount: adRatio(1.5), scaling: "ad", area: { shape: "single" } }],
    },
  },
  {
    id: "harpy",
    name: "Harpy",
    cost: 1,
    traits: [],
    stats: roleStats("marksman", 1, { maxHp: -150, attackDamage: -20 }),
    ability: {
      name: "Shriek",
      description: "Screeches at its target.",
      target: "currentTarget",
      castTimeMs: 300,
      effects: [{ kind: "damage", damageType: "magic", amount: abilityValues(1, 80), scaling: "ap", area: { shape: "single" } }],
    },
  },
  {
    id: "minotaur",
    name: "Minotaur",
    cost: 2,
    traits: [],
    stats: roleStats("tank", 2, { maxHp: 300 }),
    ability: {
      name: "Gore",
      description: "Charges and stuns its target.",
      target: "currentTarget",
      castTimeMs: 500,
      effects: [
        { kind: "damage", damageType: "physical", amount: adRatio(2), scaling: "ad", area: { shape: "single" } },
        { kind: "stun", durationMs: durationValues(1000), area: { shape: "single" } },
      ],
    },
  },
  {
    id: "hydra",
    name: "Lernaean Hydra",
    cost: 4,
    traits: [],
    stats: roleStats("tank", 4, { maxHp: 1500, attackDamage: 30 }),
    ability: {
      name: "Many Heads",
      description: "Bites every adjacent enemy and regrows.",
      target: "self",
      castTimeMs: 600,
      effects: [
        { kind: "damage", damageType: "magic", amount: abilityValues(4, 120), scaling: "ap", area: { shape: "radius", radius: 1 } },
        { kind: "heal", amount: abilityValues(4, 250), scaling: "ap", area: { shape: "self" } },
      ],
    },
  },
  {
    id: "jormungandr",
    name: "Jormungandr",
    cost: 5,
    traits: [],
    stats: roleStats("tank", 5, { maxHp: 3500, attackDamage: 60, armor: 40, magicResist: 40 }),
    ability: {
      name: "World Serpent",
      description: "Poisons every enemy.",
      target: "self",
      castTimeMs: 800,
      effects: [{ kind: "damage", damageType: "magic", amount: abilityValues(5, 120), scaling: "ap", area: { shape: "all" } }],
    },
  },
];

const at = (defId: string, star: 1 | 2 | 3, col: number, row: number): Placement => ({ defId, star, hex: { col, row } });

/** Vagues PvE, par étape. Clé = "étape-round". */
export const PVE_WAVES: Record<string, readonly Placement[]> = {
  "1-2": [at("wolf_pup", 1, 2, 3), at("wolf_pup", 1, 4, 3)],
  "1-3": [at("wolf_pup", 1, 2, 3), at("wolf_pup", 1, 4, 3), at("harpy_chick", 1, 3, 0)],
  "1-4": [at("wolf_pup", 1, 3, 3), at("harpy_chick", 1, 2, 0), at("harpy_chick", 1, 4, 0)],
  "2-7": [at("minotaur", 1, 3, 3), at("wolf", 2, 2, 3), at("wolf", 2, 4, 3)],
  "3-7": [at("hydra", 1, 3, 3)],
  "4-7": [at("hydra", 2, 3, 3), at("minotaur", 2, 2, 3), at("minotaur", 2, 4, 3)],
  "5-7": [at("jormungandr", 1, 3, 3)],
  "6-7": [at("jormungandr", 2, 3, 3), at("hydra", 2, 2, 3), at("hydra", 2, 4, 3)],
};

/** Vague d'un round PvE ; au-delà des vagues définies, on reprend la dernière. */
export function pveWave(stage: number, round: number): readonly Placement[] {
  return PVE_WAVES[`${stage}-${round}`] ?? PVE_WAVES["6-7"]!;
}
