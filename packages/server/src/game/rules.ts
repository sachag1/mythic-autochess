// Règles de base d'une partie (sur le modèle de TFT). Un présage peut en modifier une partie.
import { SHOP_ODDS_BY_LEVEL, type Modifier } from "@autochess/sim";

export const START_HP = 100;
export const BENCH_SIZE = 9;
export const ITEM_BENCH_SIZE = 10;
export const MAX_ITEMS_PER_UNIT = 3;
export const MAX_LEVEL = 10;
/** XP nécessaire pour passer au niveau suivant, indexée par niveau actuel. */
export const XP_TO_NEXT: Record<number, number> = { 1: 2, 2: 2, 3: 6, 4: 10, 5: 20, 6: 36, 7: 48, 8: 76, 9: 84 };
export const PASSIVE_XP_PER_ROUND = 2;

export const TIMERS = {
  omenVoteMs: 20_000,
  planningMs: 30_000,
  armoryPickMs: 8_000,
  /** Temps laissé au client pour finir l'animation du combat. */
  combatBufferMs: 3_000,
};

export type RoundKind = "armory" | "pve" | "pvp";

/** Étape 1 : armurerie puis 3 rounds PvE. Ensuite : 3 PvP, armurerie, 2 PvP, 1 PvE. */
export function roundKind(stage: number, round: number): RoundKind {
  if (stage === 1) return round === 1 ? "armory" : "pve";
  if (round === 4) return "armory";
  if (round === 7) return "pve";
  return "pvp";
}

export function roundsInStage(stage: number): number {
  return stage === 1 ? 4 : 7;
}

/** Or gagné automatiquement au début de chaque phase de préparation. */
export function passiveIncome(stage: number, round: number): number {
  if (stage === 1) return round <= 3 ? 2 : 3;
  if (stage === 2 && round === 1) return 4;
  return 5;
}

export function streakBonus(streak: number): number {
  const n = Math.abs(streak);
  if (n >= 5) return 3;
  if (n === 4) return 2;
  if (n >= 2) return 1;
  return 0;
}

/** Dégâts infligés au perdant : base de l'étape + 1 par étoile des unités survivantes. */
export function stageDamage(stage: number): number {
  const table = [0, 0, 2, 5, 8, 10, 12, 17];
  return table[Math.min(stage, table.length - 1)]!;
}

export interface GameRules {
  rerollCost: number;
  freeRerollsPerRound: number;
  xpCost: number;
  xpPerPurchase: number;
  interestCap: number;
  bonusGoldPerRound: number;
  shopOdds: Record<number, readonly [number, number, number, number, number]>;
  /** Bonus de combat appliqués à tous les joueurs. */
  combatModifiers: Modifier[];
  extraPveComponents: number;
  /** Étape au début de laquelle chaque joueur reçoit un objet complet (null = jamais). */
  completedItemAtStage: number | null;
  /** À partir de cette étape, l'armurerie propose des objets complets. */
  armoryCompletedFromStage: number;
  /** Multiplicateur des dégâts aux joueurs à partir d'une étape. */
  damageMultiplier: { fromStage: number; multiplier: number } | null;
}

export const DEFAULT_RULES: GameRules = {
  rerollCost: 2,
  freeRerollsPerRound: 0,
  xpCost: 4,
  xpPerPurchase: 4,
  interestCap: 5,
  bonusGoldPerRound: 0,
  shopOdds: SHOP_ODDS_BY_LEVEL,
  combatModifiers: [],
  extraPveComponents: 0,
  completedItemAtStage: null,
  armoryCompletedFromStage: 5,
  damageMultiplier: null,
};
