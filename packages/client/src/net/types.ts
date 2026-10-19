// État de la partie tel que reçu du serveur (copie JSON du schéma Colyseus).
import type { BattleEvent, Team } from "@autochess/sim";

export interface UnitSnap {
  uid: string;
  defId: string;
  star: number;
  items: string[];
}

export interface PlayerSnap {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  hp: number;
  gold: number;
  level: number;
  xp: number;
  xpToNext: number;
  streak: number;
  alive: boolean;
  placement: number;
  /** Privé : vide pour les autres joueurs. */
  shop?: string[];
  shopLocked?: boolean;
  freeRerolls?: number;
  bench: Record<string, UnitSnap>;
  board: Record<string, UnitSnap>;
  items: string[];
  omenVote: string;
  lastResult: string;
  /** Butin du dernier round PvE : « item:<id> », « gold:<n> », « unit:<defId> », « sold:<defId> ». */
  lastLoot?: string[];
  augments: string[];
  augmentChoices?: string[];
  augmentRerolls?: number;
}

export interface ArmoryOfferSnap {
  defId: string;
  item: string;
  takenBy: string;
}

export type Phase = "lobby" | "omen" | "armory" | "planning" | "combat" | "ended";

export interface GameSnap {
  phase: Phase;
  stage: number;
  round: number;
  phaseEndsAt: number;
  hostId: string;
  omenChoices: string[];
  omen: string;
  omenDetail: string;
  players: Record<string, PlayerSnap>;
  armory: ArmoryOfferSnap[];
  armoryPicker: string;
}

export interface BattleReport {
  playerId: string;
  opponentId: string | null;
  ghost: boolean;
  side: Team;
  winner: Team | null;
  events: BattleEvent[];
}

export type Location = { zone: "bench"; index: number } | { zone: "board"; col: number; row: number };

export interface RankingEntry {
  id: string;
  name: string;
  placement: number | null;
}
