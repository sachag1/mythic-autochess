// Grille hexagonale en coordonnées "offset odd-r" (les rangées impaires sont décalées
// d'une demi-case vers la droite), convertie en coordonnées cube pour les calculs.
// Référence : https://www.redblobgames.com/grids/hexagons/

export const BOARD_COLS = 7;
export const BOARD_ROWS = 8;
/** Rangées par joueur : chacun place ses unités sur les rangées 0..3 de son plateau. */
export const HALF_ROWS = BOARD_ROWS / 2;

export interface Hex {
  col: number;
  row: number;
}

interface Cube {
  x: number;
  y: number;
  z: number;
}

const EVEN_ROW_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1],
];
const ODD_ROW_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1],
];

function toCube({ col, row }: Hex): Cube {
  const x = col - (row - (row & 1)) / 2;
  const z = row;
  return { x, y: -x - z, z };
}

export function hexDistance(a: Hex, b: Hex): number {
  const ca = toCube(a);
  const cb = toCube(b);
  return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z));
}

export function isOnBoard({ col, row }: Hex): boolean {
  return col >= 0 && col < BOARD_COLS && row >= 0 && row < BOARD_ROWS;
}

export function sameHex(a: Hex, b: Hex): boolean {
  return a.col === b.col && a.row === b.row;
}

export function hexKey({ col, row }: Hex): number {
  return row * BOARD_COLS + col;
}

export function neighbors(hex: Hex): Hex[] {
  const dirs = hex.row & 1 ? ODD_ROW_DIRECTIONS : EVEN_ROW_DIRECTIONS;
  const out: Hex[] = [];
  for (const [dc, dr] of dirs) {
    const n = { col: hex.col + dc, row: hex.row + dr };
    if (isOnBoard(n)) out.push(n);
  }
  return out;
}

/** Place une case du plateau du joueur 2 dans la moitié haute du plateau de combat. */
export function mirrorHex({ col, row }: Hex): Hex {
  return { col: BOARD_COLS - 1 - col, row: BOARD_ROWS - 1 - row };
}

/**
 * Recherche en largeur depuis `start` jusqu'à une case à distance <= `range` de `goal`,
 * en évitant les cases bloquées. Retourne la première case du chemin, ou null.
 * L'ordre des voisins est fixe : le résultat est déterministe.
 */
export function nextStepToward(
  start: Hex,
  goal: Hex,
  range: number,
  isBlocked: (hex: Hex) => boolean,
): Hex | null {
  if (hexDistance(start, goal) <= range) return null;
  const startKey = hexKey(start);
  const cameFrom = new Map<number, number>([[startKey, -1]]);
  const queue: Hex[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    for (const next of neighbors(current)) {
      const key = hexKey(next);
      if (cameFrom.has(key) || isBlocked(next)) continue;
      cameFrom.set(key, hexKey(current));
      if (hexDistance(next, goal) <= range) {
        // Remonte le chemin jusqu'à la case juste après le départ.
        let step = key;
        while (cameFrom.get(step) !== startKey) step = cameFrom.get(step)!;
        return { col: step % BOARD_COLS, row: Math.floor(step / BOARD_COLS) };
      }
      queue.push(next);
    }
  }
  return null;
}
