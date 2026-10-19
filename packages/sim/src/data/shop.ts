// Économie de la boutique, sur le modèle de TFT. Utilisé par le serveur, pas par le combat.

import type { Cost } from "./balance.js";

/** Nombre d'exemplaires de chaque unité dans le pool commun aux 8 joueurs. */
export const POOL_SIZE_BY_COST: Record<Cost, number> = { 1: 30, 2: 25, 3: 18, 4: 10, 5: 9 };

/** Probabilités (en %) de tirer chaque coût dans la boutique, selon le niveau du joueur. */
export const SHOP_ODDS_BY_LEVEL: Record<number, readonly [number, number, number, number, number]> = {
  1: [100, 0, 0, 0, 0],
  2: [100, 0, 0, 0, 0],
  3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0],
  5: [45, 33, 20, 2, 0],
  6: [30, 40, 25, 5, 0],
  7: [19, 30, 35, 15, 1],
  8: [18, 25, 32, 22, 3],
  9: [10, 20, 25, 35, 10],
  10: [5, 10, 20, 40, 25],
};

export const SHOP_SLOTS = 5;
export const REROLL_COST = 2;
/** Nombre d'unités sur le plateau = niveau du joueur. */
export const MAX_LEVEL = 10;
