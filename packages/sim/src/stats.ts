import type { StarLevel, StatBonus, StatKey, Stats, UnitDef } from "./types.js";

/** Multiplicateur des PV et des dégâts d'attaque selon les étoiles (comme TFT). */
export const STAR_MULTIPLIER: Record<StarLevel, number> = { 1: 1, 2: 1.8, 3: 3.24 };

export function baseStatsFor(def: UnitDef, star: StarLevel): Stats {
  const m = STAR_MULTIPLIER[star];
  return {
    ...def.stats,
    maxHp: def.stats.maxHp * m,
    attackDamage: def.stats.attackDamage * m,
  };
}

export function addStats(target: Stats, bonus: StatBonus): void {
  for (const key of Object.keys(bonus) as StatKey[]) {
    target[key] += bonus[key] ?? 0;
  }
}

export function mitigationMultiplier(resist: number): number {
  // Une résistance négative augmente les dégâts, plafonnée pour rester raisonnable.
  return 100 / (100 + Math.max(resist, -50));
}
