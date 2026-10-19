// Gabarits d'équilibrage. Toutes les unités partent d'un rôle + d'un coût : une unité à
// 5 pièces est mécaniquement plus forte qu'une unité à 1 pièce, mais deux unités du
// même coût ont le même « budget ». On ajuste ensuite à la main avec de petits bonus.

import type { StarValues, Stats } from "../types.js";

export type Role = "tank" | "bruiser" | "assassin" | "marksman" | "mage" | "support";
export type Cost = 1 | 2 | 3 | 4 | 5;

const DEFAULT_STATS: Omit<Stats, "maxHp" | "attackDamage" | "armor" | "magicResist" | "attackSpeed" | "range" | "startMana" | "maxMana"> = {
  abilityPower: 100,
  attackSpeedPct: 0,
  critChance: 0.25,
  critDamage: 1.4,
  damageAmp: 0,
  durability: 0,
  omnivamp: 0,
};

/** Stats d'une unité à 1 pièce, 1 étoile. */
const ROLE_TEMPLATES: Record<Role, Pick<Stats, "maxHp" | "attackDamage" | "armor" | "magicResist" | "attackSpeed" | "range" | "startMana" | "maxMana">> = {
  tank: { maxHp: 650, attackDamage: 45, armor: 40, magicResist: 40, attackSpeed: 0.6, range: 1, startMana: 30, maxMana: 90 },
  bruiser: { maxHp: 650, attackDamage: 58, armor: 30, magicResist: 30, attackSpeed: 0.7, range: 1, startMana: 0, maxMana: 60 },
  assassin: { maxHp: 560, attackDamage: 60, armor: 25, magicResist: 25, attackSpeed: 0.75, range: 1, startMana: 0, maxMana: 50 },
  marksman: { maxHp: 450, attackDamage: 55, armor: 15, magicResist: 15, attackSpeed: 0.8, range: 4, startMana: 0, maxMana: 70 },
  mage: { maxHp: 500, attackDamage: 35, armor: 15, magicResist: 20, attackSpeed: 0.7, range: 4, startMana: 30, maxMana: 50 },
  support: { maxHp: 500, attackDamage: 35, armor: 20, magicResist: 20, attackSpeed: 0.65, range: 3, startMana: 30, maxMana: 80 },
};

/** Multiplicateurs par coût (index 0 = 1 pièce). */
const HP_BY_COST = [1, 1.2, 1.32, 1.48, 1.6] as const;
const AD_BY_COST = [1, 1.16, 1.26, 1.37, 1.5] as const;
const ABILITY_BY_COST = [1, 1.4, 1.6, 1.85, 2.2] as const;
const ABILITY_BY_STAR = [1, 1.5, 2.1] as const;

export function roleStats(role: Role, cost: Cost, tweak: Partial<Stats> = {}): Stats {
  const template = ROLE_TEMPLATES[role];
  const stats: Stats = {
    ...DEFAULT_STATS,
    ...template,
    maxHp: Math.round(template.maxHp * HP_BY_COST[cost - 1]!),
    attackDamage: Math.round(template.attackDamage * AD_BY_COST[cost - 1]!),
  };
  for (const [key, value] of Object.entries(tweak) as [keyof Stats, number][]) {
    stats[key] += value;
  }
  return stats;
}

/** Valeur d'un sort selon le coût, puis ×1 / ×1.5 / ×2.25 selon les étoiles. */
export function abilityValues(cost: Cost, base: number): StarValues {
  const v = base * ABILITY_BY_COST[cost - 1]!;
  return [Math.round(v * ABILITY_BY_STAR[0]), Math.round(v * ABILITY_BY_STAR[1]), Math.round(v * ABILITY_BY_STAR[2])];
}

/** Ratio de dégâts d'attaque (les dégâts d'attaque augmentent déjà avec les étoiles). */
export function adRatio(ratio: number): StarValues {
  return [ratio, ratio, ratio + 0.25];
}

/** Durée d'un contrôle : un peu plus longue à chaque étoile. */
export function durationValues(baseMs: number): StarValues {
  return [baseMs, Math.round(baseMs * 1.15), Math.round(baseMs * 1.3)];
}

/** Même valeur quel que soit le niveau d'étoiles (synergies, objets). */
export function flat(value: number): StarValues {
  return [value, value, value];
}
