// Salon Colyseus : une partie de 8 joueurs. Le salon ne contient aucune règle du jeu ;
// il transmet les actions à `Game` et recopie son état dans le schéma synchronisé.
import { Room, type Client } from "@colyseus/core";
import { ArraySchema, StateView } from "@colyseus/schema";
import { createBot } from "../game/bot.js";
import { Game, type ActionResult, type Location, type OwnedUnit } from "../game/game.js";
import { MAX_LEVEL, XP_TO_NEXT } from "../game/rules.js";
import { ArmoryOfferSchema, GameStateSchema, PlayerSchema, UnitState } from "./schema.js";

export const MAX_PLAYERS = 8;
const TICK_MS = 250;
/** Sans clic sur « commencer », la partie démarre seule (complétée par des bots). */
const LOBBY_TIMEOUT_MS = 60_000;
const RECONNECT_SECONDS = 60;

export interface CreateOptions {
  /** Graine de la partie (tests) ; aléatoire par défaut. */
  seed?: number;
  /** Démarrage automatique du lobby, en ms. */
  lobbyTimeoutMs?: number;
}

export interface JoinOptions {
  name?: string;
}

export class GameRoom extends Room<{ state: GameStateSchema }> {
  override maxClients = MAX_PLAYERS;
  game: Game | null = null;
  private seed = 0;
  private lobby: { id: string; name: string }[] = [];
  private lastSyncedVersion = -1;
  private lastPhase = "";

  override onCreate(options: CreateOptions = {}): void {
    this.state = new GameStateSchema();
    this.seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.clock.setTimeout(() => this.startGame(), options.lobbyTimeoutMs ?? LOBBY_TIMEOUT_MS);
    this.state.phaseEndsAt = Date.now() + (options.lobbyTimeoutMs ?? LOBBY_TIMEOUT_MS);

    this.onMessage("start", (client) => {
      if (client.sessionId === this.state.hostId) this.startGame();
    });
    this.onMessage("vote", (client, msg: { omen: string }) => this.act(client, "vote", (g, id) => g.voteOmen(id, msg?.omen)));
    this.onMessage("pick", (client, msg: { offer: number }) => this.act(client, "pick", (g, id) => g.pickArmory(id, msg?.offer)));
    this.onMessage("buy", (client, msg: { slot: number }) => this.act(client, "buy", (g, id) => g.buy(id, msg?.slot)));
    this.onMessage("sell", (client, msg: { at: Location }) => this.act(client, "sell", (g, id) => g.sell(id, msg?.at)));
    this.onMessage("reroll", (client) => this.act(client, "reroll", (g, id) => g.reroll(id)));
    this.onMessage("buyXp", (client) => this.act(client, "buyXp", (g, id) => g.buyXp(id)));
    this.onMessage("lock", (client) => this.act(client, "lock", (g, id) => g.toggleShopLock(id)));
    this.onMessage("move", (client, msg: { from: Location; to: Location }) =>
      this.act(client, "move", (g, id) => g.move(id, msg?.from, msg?.to)),
    );
    this.onMessage("arrange", (client, msg: { layout: { uid: string; col: number; row: number }[] }) =>
      this.act(client, "arrange", (g, id) => g.arrange(id, msg?.layout ?? [])),
    );
    this.onMessage("equip", (client, msg: { item: number; at: Location }) =>
      this.act(client, "equip", (g, id) => g.equip(id, msg?.item, msg?.at)),
    );

    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS);
  }

  override onJoin(client: Client, options: JoinOptions = {}): void {
    if (this.game) throw new Error("Game already started");
    const name = (options.name ?? "").trim().slice(0, 20) || `Player ${this.lobby.length + 1}`;
    this.lobby.push({ id: client.sessionId, name });
    if (!this.state.hostId) this.state.hostId = client.sessionId;

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = name;
    player.connected = true;
    this.state.players.set(client.sessionId, player);
    client.view = new StateView();
    client.view.add(player);

    if (this.lobby.length >= MAX_PLAYERS) this.startGame();
  }

  override async onDrop(client: Client): Promise<void> {
    if (!this.game) {
      this.removeFromLobby(client.sessionId);
      return;
    }
    // Déconnexion inattendue : un bot joue à sa place en attendant son retour.
    this.handOverToBot(client.sessionId);
    await this.allowReconnection(client, RECONNECT_SECONDS);
  }

  override onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !this.game) return;
    client.view = new StateView();
    client.view.add(player);
    this.game.setBotBrain(client.sessionId, null);
    player.connected = true;
    this.sync(true);
  }

  override onLeave(client: Client): void {
    if (!this.game) {
      this.removeFromLobby(client.sessionId);
      return;
    }
    this.handOverToBot(client.sessionId);
  }

  // ---------------------------------------------------------------- partie

  private startGame(): void {
    if (this.game || this.lobby.length === 0) return;
    this.lock();
    const players = [...this.lobby];
    for (let i = players.length; i < MAX_PLAYERS; i++) players.push({ id: `bot-${i}`, name: `Bot ${i - this.lobby.length + 1}` });

    this.game = new Game({ seed: this.seed, players: players.map((p, i) => ({ ...p, isBot: i >= this.lobby.length })) });
    players.slice(this.lobby.length).forEach((p, i) => {
      this.game!.setBotBrain(p.id, createBot(this.seed + i).brain);
      const schema = new PlayerSchema();
      schema.id = p.id;
      schema.name = p.name;
      this.state.players.set(p.id, schema);
    });
    // Les bots votent tout de suite pour le présage.
    for (const p of players.slice(this.lobby.length)) createBot(this.seed + 99).brain(this.game, p.id);

    this.game.onBattle((report) => {
      const client = this.clients.find((c) => c.sessionId === report.playerId);
      client?.send("battle", report);
    });
    this.sync(true);
  }

  private tick(dt: number): void {
    if (!this.game || this.game.isOver()) return;
    this.game.tick(dt);
    this.sync();
    if (this.game.isOver()) {
      const ranking = [...this.game.players.values()]
        .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))
        .map((p) => ({ id: p.id, name: p.name, placement: p.placement }));
      this.broadcast("gameOver", { ranking });
    }
  }

  private act(client: Client, action: string, run: (game: Game, playerId: string) => ActionResult): void {
    if (!this.game) {
      client.send("error", { action, error: "The game has not started" });
      return;
    }
    let result: ActionResult;
    try {
      result = run(this.game, client.sessionId);
    } catch {
      result = { ok: false, error: "Invalid message" };
    }
    if (!result.ok) client.send("error", { action, error: result.error });
    this.sync();
  }

  private handOverToBot(playerId: string): void {
    const player = this.state.players.get(playerId);
    if (player) player.connected = false;
    this.game?.setBotBrain(playerId, createBot(this.seed + playerId.length).brain);
  }

  private removeFromLobby(playerId: string): void {
    this.lobby = this.lobby.filter((p) => p.id !== playerId);
    this.state.players.delete(playerId);
    if (this.state.hostId === playerId) this.state.hostId = this.lobby[0]?.id ?? "";
  }

  // ---------------------------------------------------------------- synchronisation

  /** Recopie l'état de `Game` dans le schéma, en ne touchant que ce qui a changé. */
  private sync(force = false): void {
    const game = this.game;
    if (!game) return;
    if (!force && game.version === this.lastSyncedVersion && game.phase === this.lastPhase) return;
    this.lastSyncedVersion = game.version;
    this.lastPhase = game.phase;

    const s = this.state;
    s.phase = game.phase;
    s.stage = game.stage;
    s.round = game.round;
    s.phaseEndsAt = Date.now() + Math.max(0, game.deadline - game.time);
    s.omen = game.omen ?? "";
    s.omenDetail = game.omenDetail ?? "";
    syncStrings(s.omenChoices, game.omenChoices);
    s.armoryPicker = game.armoryPicker ?? "";

    while (s.armory.length > game.armory.length) s.armory.pop();
    game.armory.forEach((offer, i) => {
      let o = s.armory[i];
      if (!o) {
        o = new ArmoryOfferSchema();
        s.armory.push(o);
      }
      o.defId = offer.defId;
      o.item = offer.item;
      o.takenBy = offer.takenBy ?? "";
    });

    for (const p of game.players.values()) {
      const ps = s.players.get(p.id);
      if (!ps) continue;
      ps.isBot = p.isBot;
      ps.hp = p.hp;
      ps.gold = p.gold;
      ps.level = p.level;
      ps.xp = p.xp;
      ps.xpToNext = p.level >= MAX_LEVEL ? 0 : XP_TO_NEXT[p.level]!;
      ps.streak = p.streak;
      ps.alive = p.alive;
      ps.placement = p.placement ?? 0;
      syncStrings(ps.shop, p.shop.map((id) => id ?? ""));
      ps.shopLocked = p.shopLocked;
      ps.freeRerolls = p.freeRerolls;
      syncStrings(ps.items, p.items);
      ps.omenVote = p.omenVote ?? "";
      ps.lastResult = p.lastResult ?? "";
      syncUnits(ps.bench, new Map(p.bench.flatMap((u, i) => (u ? [[String(i), u] as const] : []))));
      syncUnits(ps.board, p.board);
    }
  }
}

function syncStrings(target: ArraySchema<string>, source: readonly string[]): void {
  while (target.length > source.length) target.pop();
  source.forEach((value, i) => {
    if (i >= target.length) target.push(value);
    else if (target[i] !== value) target[i] = value;
  });
}

function syncUnits(target: PlayerSchema["bench"], source: ReadonlyMap<string, OwnedUnit>): void {
  for (const key of [...target.keys()]) {
    if (!source.has(key)) target.delete(key);
  }
  for (const [key, unit] of source) {
    let u = target.get(key);
    if (!u || u.uid !== unit.uid) {
      u = new UnitState();
      u.uid = unit.uid;
      target.set(key, u);
    }
    u.defId = unit.defId;
    u.star = unit.star;
    syncStrings(u.items, unit.items);
  }
}
