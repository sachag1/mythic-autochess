// Textes de l'interface (en français) et traduction des erreurs du serveur.

const ERRORS: Record<string, string> = {
  "Not enough gold": "Pas assez d'or",
  "Bench is full": "Le banc est plein",
  "Shop is closed": "La boutique est fermée",
  "Empty shop slot": "Case vide",
  "No unit there": "Aucune unité ici",
  "Cannot change the board during combat": "Impossible de modifier le plateau pendant le combat",
  "Cannot move units now": "Impossible de déplacer des unités maintenant",
  "Invalid location": "Case invalide",
  "Already at max level": "Niveau maximum atteint",
  "This unit already holds 3 items": "Cette unité porte déjà 3 objets",
  "No item there": "Aucun objet ici",
  "Not your turn to pick": "Ce n'est pas votre tour",
  "Offer not available": "Offre déjà prise",
  "Not in the armory phase": "L'armurerie est fermée",
  "The vote is over": "Le vote est terminé",
  "No augment to choose": "Aucun augment à choisir",
  "No augment reroll left": "Plus de relance d'augment",
  "The game has not started": "La partie n'a pas commencé",
  "Player is not in the game": "Vous n'êtes plus en jeu",
  "Not enough room on the bench": "Pas assez de place sur le banc",
  "Two units on the same hex": "Deux unités sur la même case",
};

export function translateError(error: string): string {
  const full = /^Board is full \(level (\d+)\)$/.exec(error);
  if (full) return `Plateau complet (niveau ${full[1]})`;
  return ERRORS[error] ?? error;
}

export const PHASE_LABELS: Record<string, string> = {
  lobby: "Salon",
  omen: "Vote du présage",
  armory: "Armurerie",
  planning: "Préparation",
  combat: "Combat",
  ended: "Partie terminée",
};

/** Type de round, même calendrier que le serveur (rules.ts). */
export function roundKindLabel(stage: number, round: number): string {
  if (stage === 1) return round === 1 ? "Armurerie" : "PvE";
  if (round === 4) return "Armurerie";
  if (round === 7) return "PvE";
  return "PvP";
}

export function ordinal(n: number): string {
  return n === 1 ? "1er" : `${n}e`;
}
