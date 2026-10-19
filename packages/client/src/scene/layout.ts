// Coordonnées du monde 3D : plateau hexagonal « odd-r » (rangées impaires décalées d'une
// demi-case vers la droite), hexagones à pointe vers le haut. La rangée 0 est la plus proche
// de la caméra : le joueur est toujours en bas.
import { BOARD_COLS, BOARD_ROWS, HALF_ROWS, type Hex } from "@autochess/sim";

/** Rayon d'un hexagone (centre → sommet). */
export const HEX_SIZE = 1;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const ROW_STEP = 1.5 * HEX_SIZE;

export const BENCH_SIZE = 9;
const BENCH_STEP = 1.6;

export interface Point {
  x: number;
  z: number;
}

export function hexToWorld({ col, row }: Hex): Point {
  return {
    x: (col - (BOARD_COLS - 1) / 2 + 0.5 * (row & 1) - 0.25) * HEX_WIDTH,
    z: ((BOARD_ROWS - 1) / 2 - row) * ROW_STEP,
  };
}

export const BENCH_Z = hexToWorld({ col: 0, row: 0 }).z + 2.5;

export function benchToWorld(index: number): Point {
  return { x: (index - (BENCH_SIZE - 1) / 2) * BENCH_STEP, z: BENCH_Z };
}

/** Case du plateau du joueur (rangées 0..3) la plus proche d'un point, ou null si trop loin. */
export function nearestOwnHex(p: Point): Hex | null {
  let best: Hex | null = null;
  // Rayon du cercle circonscrit : couvre toute la case, bords compris.
  let bestD = 1.05 * HEX_SIZE;
  for (let row = 0; row < HALF_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const w = hexToWorld({ col, row });
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = { col, row };
      }
    }
  }
  return best;
}

export function nearestBenchSlot(p: Point): number | null {
  if (Math.abs(p.z - BENCH_Z) > 1) return null;
  const i = Math.round(p.x / BENCH_STEP + (BENCH_SIZE - 1) / 2);
  return i >= 0 && i < BENCH_SIZE ? i : null;
}
