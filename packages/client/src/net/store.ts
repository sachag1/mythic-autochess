// Connexion au salon Colyseus et état de l'application, lu par React via useSyncExternalStore.
import { Client, type Room } from "@colyseus/sdk";
import { useSyncExternalStore } from "react";
import { translateError } from "../ui/text";
import type { BattleReport, GameSnap, Location, PlayerSnap, RankingEntry } from "./types";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname || "localhost"}:2567`;
const TOKEN_KEY = "autochess.reconnect";

export interface Toast {
  id: number;
  text: string;
}

export interface AppState {
  status: "idle" | "connecting" | "connected";
  connectError: string | null;
  sessionId: string;
  roomId: string;
  game: GameSnap | null;
  /** Combat en cours de replay ; `startedAt` en temps `performance.now()`. */
  battle: { report: BattleReport; startedAt: number } | null;
  ranking: RankingEntry[] | null;
  toasts: Toast[];
}

let state: AppState = {
  status: "idle",
  connectError: null,
  sessionId: "",
  roomId: "",
  game: null,
  battle: null,
  ranking: null,
  toasts: [],
};

const listeners = new Set<() => void>();
const client = new Client(SERVER_URL);
let room: Room | null = null;
let toastId = 0;

function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function getState(): AppState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

/** Joueur local (null avant le début ou hors partie). */
export function me(s: AppState = state): PlayerSnap | null {
  return s.game?.players[s.sessionId] ?? null;
}

export function toast(text: string): void {
  const t = { id: ++toastId, text };
  set({ toasts: [...state.toasts, t].slice(-4) });
  setTimeout(() => set({ toasts: state.toasts.filter((x) => x.id !== t.id) }), 3500);
}

// ---------------------------------------------------------------- connexion

export async function connect(mode: "join" | "create" | "code", name: string, roomId = ""): Promise<void> {
  set({ status: "connecting", connectError: null });
  try {
    const r =
      mode === "create"
        ? await client.create("game", { name })
        : mode === "code"
          ? await client.joinById(roomId.trim(), { name })
          : await client.joinOrCreate("game", { name });
    attach(r);
  } catch (e) {
    set({ status: "idle", connectError: describeError(e) });
  }
}

/** Après un rechargement de page, tente de revenir dans la partie en cours. */
export async function tryReconnect(): Promise<void> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return;
  set({ status: "connecting" });
  try {
    attach(await client.reconnect(token));
  } catch {
    sessionStorage.removeItem(TOKEN_KEY);
    set({ status: "idle" });
  }
}

export async function leave(): Promise<void> {
  sessionStorage.removeItem(TOKEN_KEY);
  const r = room;
  room = null;
  set({ status: "idle", game: null, battle: null, ranking: null, sessionId: "", roomId: "" });
  await r?.leave(true).catch(() => undefined);
}

function attach(r: Room): void {
  room = r;
  sessionStorage.setItem(TOKEN_KEY, r.reconnectionToken);
  set({ status: "connected", sessionId: r.sessionId, roomId: r.roomId, connectError: null });

  r.onStateChange((s: { toJSON(): unknown }) => {
    const game = s.toJSON() as GameSnap;
    const prev = state.game;
    const patch: Partial<AppState> = { game };
    // Fin du combat : on retire le replay quand la phase change.
    if (prev?.phase === "combat" && game.phase !== "combat") patch.battle = null;
    set(patch);
  });
  r.onMessage("battle", (report: BattleReport) => set({ battle: { report, startedAt: performance.now() } }));
  r.onMessage("error", (msg: { action: string; error: string }) => toast(translateError(msg.error)));
  r.onMessage("gameOver", (msg: { ranking: RankingEntry[] }) => {
    sessionStorage.removeItem(TOKEN_KEY);
    set({ ranking: msg.ranking });
  });
  r.onLeave((code: number) => {
    if (room !== r) return;
    room = null;
    set({ status: "idle", game: null, battle: null, connectError: code > 1000 ? `Déconnecté (code ${code})` : null });
  });
}

function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/ECONNREFUSED|Failed to fetch|NetworkError|network/i.test(msg)) return "Serveur injoignable : lancez « npm start -w @autochess/server ».";
  return msg;
}

// ---------------------------------------------------------------- actions

function send(type: string, payload?: unknown): void {
  room?.send(type, payload);
}

export const actions = {
  start: () => send("start"),
  vote: (omen: string) => send("vote", { omen }),
  pick: (offer: number) => send("pick", { offer }),
  chooseAugment: (index: number) => send("augment", { index }),
  rerollAugments: () => send("rerollAugments"),
  buy: (slot: number) => send("buy", { slot }),
  sell: (at: Location) => send("sell", { at }),
  reroll: () => send("reroll"),
  buyXp: () => send("buyXp"),
  lock: () => send("lock"),
  move: (from: Location, to: Location) => send("move", { from, to }),
  arrange: (layout: { uid: string; col: number; row: number }[]) => send("arrange", { layout }),
  equip: (item: number, at: Location) => send("equip", { item, at }),
};
