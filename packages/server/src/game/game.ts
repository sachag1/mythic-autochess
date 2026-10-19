// Logique complète d'une partie, sans réseau : boutique, pool partagé, économie, niveaux,
// fusions, objets, rounds, appariement, combats, éliminations. Le salon Colyseus ne fait
// qu'appeler ces méthodes et synchroniser l'état vers les clients.
import {
  BOARD_COLS,
  createContent,
  HALF_ROWS,
  ITEMS,
  POOL_SIZE_BY_COST,
  pveWave,
  Rng,
  runBattle,
  type BattleEvent,
  type Content,
  type Modifier,
  type Placement,
  type StarLevel,
  type Team,
} from "@autochess/sim";
import { AUGMENT_ROUNDS, AUGMENTS, AUGMENTS_BY_ID, TIER_PATTERNS, type AugmentTier } from "./augments.js";
import { drawOmenChoices, resolveOmenVote, rulesForOmen } from "./omens.js";
import {
  BENCH_SIZE,
  DEFAULT_RULES,
  ITEM_BENCH_SIZE,
  MAX_ITEMS_PER_UNIT,
  MAX_LEVEL,
  passiveIncome,
  PASSIVE_XP_PER_ROUND,
  roundKind,
  roundsInStage,
  stageDamage,
  START_HP,
  streakBonus,
  TIMERS,
  XP_TO_NEXT,
  type GameRules,
} from "./rules.js";

export interface OwnedUnit {
  uid: string;
  defId: string;
  star: StarLevel;
  items: string[];
}

export type Location = { zone: "bench"; index: number } | { zone: "board"; col: number; row: number };

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  hp: number;
  gold: number;
  level: number;
  xp: number;
  /** > 0 : série de victoires, < 0 : série de défaites. */
  streak: number;
  alive: boolean;
  /** Classement final (1 = vainqueur), null tant que le joueur est en vie. */
  placement: number | null;
  shop: (string | null)[];
  shopLocked: boolean;
  freeRerolls: number;
  bench: (OwnedUnit | null)[];
  /** Clé "col,row" sur la moitié du plateau du joueur (rangées 0..3). */
  board: Map<string, OwnedUnit>;
  items: string[];
  recentOpponents: string[];
  /** Protection contre la malchance : nombre de boutiques d'affilée sans voir une unité possédée. */
  missedShops: Map<string, number>;
  omenVote: string | null;
  lastResult: "win" | "loss" | "draw" | null;
  augments: string[];
  /** Sac d'orbes PvE : tout le monde a le même contenu, seul l'ordre change. */
  orbBag: OrbKind[];
  /** Butin du dernier round PvE : "item:<id>", "gold:<n>", "unit:<id>" ou "sold:<id>" (banc plein). */
  lastLoot: string[];
  /** Augments proposés en attente de choix (vide hors des rounds d'augment). */
  augmentChoices: string[];
  augmentRerolls: number;
}

export type Phase = "omen" | "armory" | "planning" | "combat" | "ended";

export interface ArmoryOffer {
  defId: string;
  item: string;
  takenBy: string | null;
}

export interface BattleReport {
  playerId: string;
  /** null = round PvE. */
  opponentId: string | null;
  /** Vrai si l'adversaire est une copie (nombre impair de joueurs en vie). */
  ghost: boolean;
  /** Côté du joueur dans le journal d'événements. */
  side: Team;
  winner: Team | null;
  events: BattleEvent[];
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface GameOptions {
  seed: number;
  players: readonly { id: string; name: string; isBot?: boolean }[];
  content?: Content;
}

interface PendingResult {
  playerId: string;
  pve: boolean;
  outcome: "win" | "loss" | "draw";
  /** Somme des étoiles des unités adverses survivantes. */
  enemySurvivorStars: number;
}

const COMPONENTS = ITEMS.filter((i) => !i.components).map((i) => i.id);
const COMPLETED = ITEMS.filter((i) => i.components).map((i) => i.id);
const RECIPES = new Map(
  ITEMS.filter((i) => i.components).map((i) => [recipeKey(i.components![0], i.components![1]), i.id]),
);
const COPIES_BY_STAR: Record<StarLevel, number> = { 1: 1, 2: 3, 3: 9 };

export type OrbKind = "component" | "gold" | "champion";
/**
 * Contenu du sac d'orbes PvE de chaque joueur. Quand il est vide, on le remplit à nouveau
 * et on le mélange : sur 4 rounds PvE, tout le monde a reçu exactement le même butin.
 */
const ORB_BAG: readonly OrbKind[] = ["component", "component", "gold", "champion"];

function recipeKey(a: string, b: string): string {
  return [a, b].sort().join("+");
}

const ok: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

export class Game {
  readonly content: Content;
  readonly rng: Rng;
  rules: GameRules = DEFAULT_RULES;
  phase: Phase = "omen";
  stage = 1;
  round = 1;
  /** Temps de jeu en ms ; avance avec tick(). */
  time = 0;
  deadline = TIMERS.omenVoteMs;
  readonly players = new Map<string, PlayerState>();
  readonly pool = new Map<string, number>();
  readonly omenChoices: string[];
  /** Rareté de chacun des 3 choix d'augment, identique pour tous les joueurs. */
  readonly augmentTiers: readonly AugmentTier[];
  omen: string | null = null;
  /** Précision tirée au sort par certains présages (ex. : le panthéon favori). */
  omenDetail: string | null = null;
  armory: ArmoryOffer[] = [];
  armoryOrder: string[] = [];
  armoryTurn = 0;
  /** Incrémenté à chaque changement : le salon sait quand resynchroniser. */
  version = 0;

  private pending: PendingResult[] = [];
  private uidCounter = 0;
  private readonly battleListeners: ((report: BattleReport) => void)[] = [];
  private readonly botBrains = new Map<string, (game: Game, playerId: string) => void>();

  constructor(options: GameOptions) {
    this.content = options.content ?? createContent();
    this.rng = new Rng(options.seed);
    for (const unit of this.content.units.values()) {
      // Les monstres PvE ont des coûts mais pas de place dans le pool : on ne prend que les
      // unités jouables (celles qui ont au moins une synergie).
      if (unit.traits.length) this.pool.set(unit.id, POOL_SIZE_BY_COST[unit.cost]);
    }
    for (const p of options.players) {
      this.players.set(p.id, {
        id: p.id,
        name: p.name,
        isBot: p.isBot ?? false,
        hp: START_HP,
        gold: 0,
        level: 1,
        xp: 0,
        streak: 0,
        alive: true,
        placement: null,
        shop: [null, null, null, null, null],
        shopLocked: false,
        freeRerolls: 0,
        bench: Array.from({ length: BENCH_SIZE }, () => null),
        board: new Map(),
        items: [],
        recentOpponents: [],
        missedShops: new Map(),
        omenVote: null,
        augments: [],
        orbBag: [],
        lastLoot: [],
        augmentChoices: [],
        augmentRerolls: 0,
        lastResult: null,
      });
    }
    this.omenChoices = drawOmenChoices(this.rng);
    this.augmentTiers = TIER_PATTERNS[this.rng.int(TIER_PATTERNS.length)]!;
  }

  // ---------------------------------------------------------------- abonnements

  onBattle(listener: (report: BattleReport) => void): void {
    this.battleListeners.push(listener);
  }

  /** Donne un « cerveau » à un bot (appelé au début de chaque phase où il peut agir). */
  setBotBrain(playerId: string, brain: ((game: Game, playerId: string) => void) | null): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.isBot = brain !== null;
    if (brain) this.botBrains.set(playerId, brain);
    else this.botBrains.delete(playerId);
    this.version++;
  }

  // ---------------------------------------------------------------- horloge

  tick(dtMs: number): void {
    if (this.phase === "ended") return;
    this.time += dtMs;
    // Les bots jouent leur tour d'armurerie dès qu'il arrive.
    if (this.phase === "armory") this.runCurrentArmoryBot();
    while (!this.isOver() && this.time >= this.deadline) this.advance();
  }

  isOver(): boolean {
    return this.phase === "ended";
  }

  /** Passe directement à la fin de la phase en cours (tests, simulation, tous prêts). */
  skipPhase(): void {
    if (this.phase === "ended") return;
    this.time = Math.max(this.time, this.deadline);
    this.advance();
  }

  private advance(): void {
    switch (this.phase) {
      case "omen":
        this.resolveOmen();
        this.startRound();
        break;
      case "armory":
        this.autoPickArmory();
        break;
      case "planning":
        this.autoChooseAugments();
        this.startCombat();
        break;
      case "combat":
        this.resolveCombat();
        this.endRound();
        break;
    }
    this.version++;
  }

  private resolveOmen(): void {
    const votes = [...this.players.values()].map((p) => p.omenVote).filter((v): v is string => v !== null);
    this.omen = resolveOmenVote(this.omenChoices, votes, this.rng);
    const { rules, detail } = rulesForOmen(this.omen, this.rng);
    this.rules = rules;
    this.omenDetail = detail ?? null;
  }

  private startRound(): void {
    const kind = roundKind(this.stage, this.round);
    if (kind === "armory") this.startArmory();
    else this.startPlanning();
  }

  private endRound(): void {
    if (this.alivePlayers().length <= 1) {
      for (const p of this.alivePlayers()) p.placement = 1;
      this.phase = "ended";
      return;
    }
    this.round++;
    if (this.round > roundsInStage(this.stage)) {
      this.stage++;
      this.round = 1;
    }
    this.startRound();
  }

  // ---------------------------------------------------------------- préparation

  private startPlanning(): void {
    this.phase = "planning";
    this.deadline = this.time + TIMERS.planningMs;
    const firstRoundOfStage = this.round === 1;
    for (const p of this.alivePlayers()) {
      const bonus = this.augmentBonuses(p);
      const interest = Math.min(this.rules.interestCap + bonus.interestCap, Math.floor(p.gold / 10));
      p.gold += passiveIncome(this.stage, this.round) + interest + streakBonus(p.streak) + this.rules.bonusGoldPerRound + bonus.gold;
      this.addXp(p, PASSIVE_XP_PER_ROUND + bonus.xp);
      p.freeRerolls = this.rules.freeRerollsPerRound + bonus.freeRerolls;
      if (firstRoundOfStage && this.stage === this.rules.completedItemAtStage) {
        this.giveItem(p, COMPLETED[this.rng.int(COMPLETED.length)]!);
      }
      // Les fusions qui touchent le plateau sont mises en attente pendant le combat.
      this.tryMerge(p);
      if (p.shopLocked) p.shopLocked = false;
      else this.rollShop(p);
      const augmentIndex = this.augmentIndex();
      if (augmentIndex !== null) {
        p.augmentChoices = this.drawAugmentChoices(p, this.augmentTiers[augmentIndex]!);
        p.augmentRerolls = 1;
      }
    }
    this.runBots();
  }

  // ---------------------------------------------------------------- augments

  /** Index du choix d'augment de ce round (0, 1 ou 2), ou null. */
  augmentIndex(): number | null {
    const i = AUGMENT_ROUNDS.findIndex(([stage, round]) => stage === this.stage && round === this.round);
    return i >= 0 ? i : null;
  }

  chooseAugment(playerId: string, index: number): ActionResult {
    const p = this.activePlayer(playerId);
    if (!p) return fail("Player is not in the game");
    const id = p.augmentChoices[index];
    if (!id) return fail("No augment to choose");
    p.augmentChoices = [];
    p.augments.push(id);
    this.applyAugment(p, id);
    this.version++;
    return ok;
  }

  rerollAugments(playerId: string): ActionResult {
    const p = this.activePlayer(playerId);
    if (!p) return fail("Player is not in the game");
    if (!p.augmentChoices.length) return fail("No augment to reroll");
    if (p.augmentRerolls <= 0) return fail("No augment reroll left");
    p.augmentRerolls--;
    const tier = AUGMENTS_BY_ID.get(p.augmentChoices[0]!)!.tier;
    p.augmentChoices = this.drawAugmentChoices(p, tier, p.augmentChoices);
    this.version++;
    return ok;
  }

  private drawAugmentChoices(p: PlayerState, tier: AugmentTier, exclude: readonly string[] = []): string[] {
    const pool = AUGMENTS.filter((a) => a.tier === tier && !p.augments.includes(a.id) && !exclude.includes(a.id)).map((a) => a.id);
    return this.shuffle(pool).slice(0, 3);
  }

  /** Fin de la préparation sans choix : un augment est pris au hasard. */
  private autoChooseAugments(): void {
    for (const p of this.alivePlayers()) {
      if (p.augmentChoices.length) this.chooseAugment(p.id, this.rng.int(p.augmentChoices.length));
    }
  }

  private applyAugment(p: PlayerState, id: string): void {
    const pick = AUGMENTS_BY_ID.get(id)!.onPick;
    if (!pick) return;
    p.gold += pick.gold ?? 0;
    if (pick.xp) this.addXp(p, pick.xp);
    if (pick.heal) p.hp = Math.min(START_HP, p.hp + pick.heal);
    for (let i = 0; i < (pick.components ?? 0); i++) this.giveItem(p, COMPONENTS[this.rng.int(COMPONENTS.length)]!);
    for (let i = 0; i < (pick.completedItems ?? 0); i++) this.giveItem(p, COMPLETED[this.rng.int(COMPLETED.length)]!);
    for (let i = 0; i < (pick.units?.count ?? 0); i++) {
      const cost = pick.units!.cost;
      // Pour une ★2, on choisit une unité dont il reste au moins 3 exemplaires.
      const copies = pick.units!.star === 2 ? 3 : 1;
      const defId = this.drawFromPool((d) => this.content.units.get(d)!.cost === cost && this.pool.get(d)! >= copies, () => 1);
      if (!defId) break;
      this.pool.set(defId, this.pool.get(defId)! - (copies - 1));
      const unit: OwnedUnit = { ...this.newUnit(defId), star: copies === 3 ? 2 : 1 };
      if (!this.addUnit(p, unit)) {
        p.gold += cost * copies;
        this.returnToPool(defId, copies);
      }
    }
  }

  private augmentBonuses(p: PlayerState): { gold: number; xp: number; freeRerolls: number; interestCap: number } {
    const total = { gold: 0, xp: 0, freeRerolls: 0, interestCap: 0 };
    for (const id of p.augments) {
      const a = AUGMENTS_BY_ID.get(id)!;
      total.gold += a.perRound?.gold ?? 0;
      total.xp += a.perRound?.xp ?? 0;
      total.freeRerolls += a.perRound?.freeRerolls ?? 0;
      total.interestCap += a.interestCapBonus ?? 0;
    }
    return total;
  }

  /** Bonus de combat d'un joueur : présage + augments. */
  modifiersFor(p: PlayerState): Modifier[] {
    return [...this.rules.combatModifiers, ...p.augments.flatMap((id) => AUGMENTS_BY_ID.get(id)!.combat ?? [])];
  }

  // ---------------------------------------------------------------- armurerie

  private startArmory(): void {
    this.phase = "armory";
    const alive = this.alivePlayers();
    const costs = this.stage === 1 ? [1] : this.stage === 2 ? [2, 3] : this.stage === 3 ? [3] : this.stage === 4 ? [3, 4] : [4, 5];
    const completed = this.stage >= this.rules.armoryCompletedFromStage;
    this.armory = [];
    for (let i = 0; i < alive.length; i++) {
      const defId = this.drawFromPool((id) => costs.includes(this.content.units.get(id)!.cost), () => 1);
      if (!defId) break;
      const items = completed ? COMPLETED : COMPONENTS;
      this.armory.push({ defId, item: items[this.rng.int(items.length)]!, takenBy: null });
    }
    // Équité : le joueur le plus bas en PV choisit en premier (au hasard à l'étape 1).
    const tieBreak = new Map(alive.map((p) => [p.id, this.rng.next()]));
    this.armoryOrder = [...alive]
      .sort((a, b) => (this.stage === 1 ? 0 : a.hp - b.hp) || tieBreak.get(a.id)! - tieBreak.get(b.id)!)
      .map((p) => p.id);
    this.armoryTurn = 0;
    this.deadline = this.time + TIMERS.armoryPickMs;
    this.runCurrentArmoryBot();
  }

  get armoryPicker(): string | null {
    return this.phase === "armory" ? (this.armoryOrder[this.armoryTurn] ?? null) : null;
  }

  pickArmory(playerId: string, offerIndex: number): ActionResult {
    if (this.phase !== "armory") return fail("Not in the armory phase");
    if (this.armoryPicker !== playerId) return fail("Not your turn to pick");
    const offer = this.armory[offerIndex];
    if (!offer || offer.takenBy) return fail("Offer not available");
    const player = this.players.get(playerId)!;
    offer.takenBy = playerId;
    this.giveItem(player, offer.item);
    const unit = this.newUnit(offer.defId);
    if (!this.addUnit(player, unit)) {
      // Banc plein : l'unité est revendue automatiquement.
      player.gold += this.content.units.get(offer.defId)!.cost;
      this.returnToPool(offer.defId, 1);
    }
    this.nextArmoryTurn();
    this.version++;
    return ok;
  }

  private autoPickArmory(): void {
    const picker = this.armoryPicker;
    if (!picker) {
      this.endRound();
      return;
    }
    const free = this.armory.map((o, i) => (o.takenBy ? -1 : i)).filter((i) => i >= 0);
    if (free.length) this.pickArmory(picker, free[this.rng.int(free.length)]!);
    else this.nextArmoryTurn();
  }

  private nextArmoryTurn(): void {
    this.armoryTurn++;
    if (this.armoryTurn >= this.armoryOrder.length || this.armory.every((o) => o.takenBy)) {
      // Unités non prises : retour au pool.
      for (const o of this.armory) if (!o.takenBy) this.returnToPool(o.defId, 1);
      this.endRound();
      return;
    }
    this.deadline = this.time + TIMERS.armoryPickMs;
    this.runCurrentArmoryBot();
  }

  private runCurrentArmoryBot(): void {
    const picker = this.armoryPicker;
    if (picker && this.botBrains.has(picker)) this.botBrains.get(picker)!(this, picker);
  }

  // ---------------------------------------------------------------- combat

  private startCombat(): void {
    // Comme dans TFT : les places libres du plateau sont complétées avec le banc.
    for (const p of this.alivePlayers()) this.autoFillBoard(p);
    this.phase = "combat";
    this.pending = [];
    const kind = roundKind(this.stage, this.round);
    let longest = 0;

    const fight = (
      a: PlayerState,
      boardB: readonly Placement[],
      modifiersB: readonly Modifier[],
      record: (winner: Team | null, survivors: number) => void,
    ) => {
      const result = runBattle({
        seed: this.rng.int(2 ** 31),
        boards: [this.placements(a), boardB],
        content: this.content,
        modifiers: [this.modifiersFor(a), modifiersB],
      });
      longest = Math.max(longest, result.durationMs);
      const survivorStars = (team: Team) => result.survivors.filter((s) => s.team === team).reduce((n, s) => n + s.star, 0);
      record(result.winner, survivorStars(1));
      return { result, survivorStars };
    };

    if (kind === "pve") {
      const wave = pveWave(this.stage, this.round);
      for (const p of this.alivePlayers()) {
        const { result } = fight(p, wave, [], (winner, enemyStars) =>
          this.pending.push({ playerId: p.id, pve: true, outcome: outcomeFor(winner, 0), enemySurvivorStars: enemyStars }),
        );
        this.emitBattle({ playerId: p.id, opponentId: null, ghost: false, side: 0, winner: result.winner, events: result.events });
      }
    } else {
      for (const [a, b, ghost] of this.pairPlayers()) {
        const { result, survivorStars } = fight(a, this.placements(b), this.modifiersFor(b), (winner, enemyStars) =>
          this.pending.push({ playerId: a.id, pve: false, outcome: outcomeFor(winner, 0), enemySurvivorStars: enemyStars }),
        );
        this.emitBattle({ playerId: a.id, opponentId: b.id, ghost, side: 0, winner: result.winner, events: result.events });
        if (!ghost) {
          this.pending.push({ playerId: b.id, pve: false, outcome: outcomeFor(result.winner, 1), enemySurvivorStars: survivorStars(0) });
          this.emitBattle({ playerId: b.id, opponentId: a.id, ghost: false, side: 1, winner: result.winner, events: result.events });
        }
      }
    }
    this.deadline = this.time + longest + TIMERS.combatBufferMs;
  }

  /**
   * Place les meilleures unités du banc tant que le plateau compte moins d'unités que le
   * niveau : corps à corps devant (rangée 3), distance derrière (rangée 0), du centre vers
   * les bords, puis n'importe quelle case libre.
   */
  private autoFillBoard(p: PlayerState): void {
    const value = (u: OwnedUnit) => this.content.units.get(u.defId)!.cost * u.star ** 2 + u.items.length * 2;
    const frontCols = [3, 2, 4, 1, 5, 0, 6];
    const backCols = [3, 2, 4, 1, 5, 0, 6];
    while (p.board.size < p.level) {
      const index = p.bench.reduce<number>((best, u, i) => (u && (best < 0 || value(u) > value(p.bench[best]!)) ? i : best), -1);
      if (index < 0) return;
      const unit = p.bench[index]!;
      const melee = this.content.units.get(unit.defId)!.stats.range <= 1;
      const preferred = melee ? frontCols.map((col) => ({ col, row: 3 })) : backCols.map((col) => ({ col, row: 0 }));
      const fallback = [2, 1, 0, 3].flatMap((row) => frontCols.map((col) => ({ col, row })));
      const hex = [...preferred, ...fallback].find(({ col, row }) => !p.board.has(`${col},${row}`));
      if (!hex) return;
      p.bench[index] = null;
      p.board.set(`${hex.col},${hex.row}`, unit);
    }
  }

  private drawOrb(p: PlayerState): OrbKind {
    if (!p.orbBag.length) p.orbBag = this.shuffle(ORB_BAG);
    return p.orbBag.pop()!;
  }

  /**
   * Ouvre un orbe. Valeurs équivalentes : un composant, ou 3 or à l'étape 1 (5 ensuite), ou un
   * champion (2 pièces à l'étape 1, 3 aux étapes 2-3, 4 ensuite) avec 1 or.
   */
  private openOrb(p: PlayerState, kind: OrbKind): string[] {
    if (kind === "component") {
      const item = COMPONENTS[this.rng.int(COMPONENTS.length)]!;
      this.giveItem(p, item);
      return [`item:${item}`];
    }
    if (kind === "gold") {
      const gold = this.stage === 1 ? 3 : 5;
      p.gold += gold;
      return [`gold:${gold}`];
    }
    const cost = this.stage === 1 ? 2 : this.stage <= 3 ? 3 : 4;
    p.gold += 1;
    const defId = this.drawFromPool((d) => this.content.units.get(d)!.cost === cost, () => 1);
    if (!defId) {
      p.gold += cost;
      return [`gold:${cost + 1}`];
    }
    if (!this.addUnit(p, this.newUnit(defId))) {
      // Banc plein : le champion est revendu automatiquement.
      p.gold += cost;
      this.returnToPool(defId, 1);
      return [`sold:${defId}`, `gold:${cost + 1}`];
    }
    return [`unit:${defId}`, "gold:1"];
  }

  /** Paires d'adversaires, en évitant de rejouer contre ses derniers adversaires. */
  private pairPlayers(): [PlayerState, PlayerState, boolean][] {
    const alive = this.alivePlayers();
    const unpaired = this.shuffle(alive);
    const memory = Math.min(3, Math.max(0, alive.length - 2));
    const pairs: [PlayerState, PlayerState, boolean][] = [];
    while (unpaired.length >= 2) {
      const a = unpaired.shift()!;
      let index = unpaired.findIndex(
        (b) => !a.recentOpponents.slice(-memory).includes(b.id) && !b.recentOpponents.slice(-memory).includes(a.id),
      );
      if (index < 0) index = 0;
      const b = unpaired.splice(index, 1)[0]!;
      pairs.push([a, b, false]);
      a.recentOpponents.push(b.id);
      b.recentOpponents.push(a.id);
    }
    if (unpaired.length === 1) {
      // Nombre impair : le dernier affronte la copie d'un autre joueur, sans lui faire de dégâts.
      const a = unpaired[0]!;
      const others = alive.filter((p) => p !== a);
      const ghost = others[this.rng.int(others.length)]!;
      pairs.push([a, ghost, true]);
      a.recentOpponents.push(ghost.id);
    }
    return pairs;
  }

  private resolveCombat(): void {
    const multiplier =
      this.rules.damageMultiplier && this.stage >= this.rules.damageMultiplier.fromStage ? this.rules.damageMultiplier.multiplier : 1;

    // Le butin affiché est celui du round qui vient de se terminer.
    for (const p of this.alivePlayers()) p.lastLoot = [];
    for (const r of this.pending) {
      const p = this.players.get(r.playerId)!;
      p.lastResult = r.outcome;
      // L'étape 1 est une mise en route : aucun dégât aux joueurs, comme dans TFT.
      if (r.outcome !== "win" && this.stage > 1) {
        p.hp -= Math.round((stageDamage(this.stage) + r.enemySurvivorStars) * multiplier);
      }
      if (r.pve) {
        // Butin normalisé : tout le monde reçoit un orbe de même valeur, victoire ou non.
        p.lastLoot = this.openOrb(p, this.drawOrb(p));
        for (let i = 0; i < this.rules.extraPveComponents; i++) p.lastLoot.push(...this.openOrb(p, "component"));
      } else if (r.outcome === "win") {
        p.streak = p.streak > 0 ? p.streak + 1 : 1;
      } else {
        p.streak = p.streak < 0 ? p.streak - 1 : -1;
      }
    }
    this.pending = [];

    const alive = this.alivePlayers();
    const dead = alive.filter((p) => p.hp <= 0).sort((a, b) => a.hp - b.hp);
    dead.forEach((p, i) => {
      p.placement = alive.length - i;
      p.alive = false;
      p.hp = 0;
      for (const unit of [...p.bench, ...p.board.values()]) {
        if (unit) this.returnToPool(unit.defId, COPIES_BY_STAR[unit.star]);
      }
      for (let i = 0; i < p.shop.length; i++) {
        if (p.shop[i]) this.returnToPool(p.shop[i]!, 1);
        p.shop[i] = null;
      }
      p.bench.fill(null);
      p.board.clear();
    });
  }

  private emitBattle(report: BattleReport): void {
    for (const listener of this.battleListeners) listener(report);
  }

  // ---------------------------------------------------------------- actions des joueurs

  buy(playerId: string, shopIndex: number): ActionResult {
    const p = this.activePlayer(playerId);
    if (!p) return fail("Player is not in the game");
    if (!this.canUseShop()) return fail("Shop is closed");
    const defId = p.shop[shopIndex];
    if (!defId) return fail("Empty shop slot");
    const cost = this.content.units.get(defId)!.cost;
    if (p.gold < cost) return fail("Not enough gold");
    const unit = this.newUnit(defId);
    if (!this.addUnit(p, unit)) return fail("Bench is full");
    p.gold -= cost;
    p.shop[shopIndex] = null;
    this.version++;
    return ok;
  }

  sell(playerId: string, location: Location): ActionResult {
    const p = this.activePlayer(playerId);
    if (!p) return fail("Player is not in the game");
    if (!this.canUseShop()) return fail("Shop is closed");
    if (location.zone === "board" && this.phase === "combat") return fail("Cannot change the board during combat");
    const unit = this.unitAt(p, location);
    if (!unit) return fail("No unit there");
    const def = this.content.units.get(unit.defId)!;
    const copies = COPIES_BY_STAR[unit.star];
    p.gold += def.cost * copies - (unit.star > 1 && def.cost > 1 ? 1 : 0);
    this.returnToPool(unit.defId, copies);
    for (const item of unit.items) this.giveItem(p, item);
    this.setUnitAt(p, location, null);
    this.version++;
    return ok;
  }

  reroll(playerId: string): ActionResult {
    const p = this.activePlayer(playerId);
    if (!p) return fail("Player is not in the game");
    if (!this.canUseShop()) return fail("Shop is closed");
    if (p.freeRerolls > 0) p.freeRerolls--;
    else if (p.gold >= this.rules.rerollCost) p.gold -= this.rules.rerollCost;
    else return fail("Not enough gold");
    this.rollShop(p);
    this.version++;
    return ok;
  }

  buyXp(playerId: string): ActionResult {
    const p = this.activePlayer(playerId);
    if (!p) return fail("Player is not in the game");
    if (!this.canUseShop()) return fail("Shop is closed");
    if (p.level >= MAX_LEVEL) return fail("Already at max level");
    if (p.gold < this.rules.xpCost) return fail("Not enough gold");
    p.gold -= this.rules.xpCost;
    this.addXp(p, this.rules.xpPerPurchase);
    this.version++;
    return ok;
  }

  toggleShopLock(playerId: string): ActionResult {
    const p = this.activePlayer(playerId);
    if (!p) return fail("Player is not in the game");
    p.shopLocked = !p.shopLocked;
    this.version++;
    return ok;
  }

  move(playerId: string, from: Location, to: Location): ActionResult {
    const p = this.activePlayer(playerId);
    if (!p) return fail("Player is not in the game");
    if (this.phase === "ended" || this.phase === "omen") return fail("Cannot move units now");
    if (this.phase === "combat" && (from.zone === "board" || to.zone === "board")) return fail("Cannot change the board during combat");
    if (!this.validLocation(to) || !this.validLocation(from)) return fail("Invalid location");
    const moving = this.unitAt(p, from);
    if (!moving) return fail("No unit there");
    const target = this.unitAt(p, to);
    if (from.zone === "bench" && to.zone === "board" && !target && p.board.size >= p.level) {
      return fail(`Board is full (level ${p.level})`);
    }
    this.setUnitAt(p, from, target);
    this.setUnitAt(p, to, moving);
    this.version++;
    return ok;
  }

  equip(playerId: string, itemIndex: number, location: Location): ActionResult {
    const p = this.activePlayer(playerId);
    if (!p) return fail("Player is not in the game");
    if (location.zone === "board" && this.phase === "combat") return fail("Cannot change the board during combat");
    const item = p.items[itemIndex];
    if (!item) return fail("No item there");
    const unit = this.unitAt(p, location);
    if (!unit) return fail("No unit there");
    const last = unit.items.at(-1);
    const combined = last && COMPONENTS.includes(last) && COMPONENTS.includes(item) ? RECIPES.get(recipeKey(last, item)) : undefined;
    if (combined) unit.items[unit.items.length - 1] = combined;
    else if (unit.items.length < MAX_ITEMS_PER_UNIT) unit.items.push(item);
    else return fail("This unit already holds 3 items");
    p.items.splice(itemIndex, 1);
    this.version++;
    return ok;
  }

  /**
   * Replace tout le plateau d'un coup (placement automatique côté client, bots).
   * Les unités absentes de `layout` retournent sur le banc.
   */
  arrange(playerId: string, layout: readonly { uid: string; col: number; row: number }[]): ActionResult {
    const p = this.activePlayer(playerId);
    if (!p) return fail("Player is not in the game");
    if (this.phase === "combat" || this.phase === "ended" || this.phase === "omen") return fail("Cannot move units now");
    if (layout.length > p.level) return fail(`Board is full (level ${p.level})`);
    const all = [...p.board.values(), ...p.bench].filter((u): u is OwnedUnit => u !== null);
    const byUid = new Map(all.map((u) => [u.uid, u]));
    const hexes = new Set<string>();
    for (const l of layout) {
      if (!byUid.has(l.uid)) return fail("Unknown unit");
      if (!this.validLocation({ zone: "board", col: l.col, row: l.row })) return fail("Invalid location");
      const key = `${l.col},${l.row}`;
      if (hexes.has(key)) return fail("Two units on the same hex");
      hexes.add(key);
    }
    const placed = new Set(layout.map((l) => l.uid));
    const rest = all.filter((u) => !placed.has(u.uid));
    if (rest.length > BENCH_SIZE) return fail("Not enough room on the bench");

    // Les unités déjà sur le banc gardent leur case ; celles qui quittent le plateau prennent les cases libres.
    const bench: (OwnedUnit | null)[] = p.bench.map((u) => (u && !placed.has(u.uid) ? u : null));
    for (const u of rest) {
      if (!bench.includes(u)) bench[bench.indexOf(null)] = u;
    }
    p.bench = bench;
    p.board = new Map(layout.map((l) => [`${l.col},${l.row}`, byUid.get(l.uid)!]));
    this.version++;
    return ok;
  }

  voteOmen(playerId: string, omenId: string): ActionResult {
    const p = this.activePlayer(playerId);
    if (!p) return fail("Player is not in the game");
    if (this.phase !== "omen") return fail("The vote is over");
    if (!this.omenChoices.includes(omenId)) return fail("Unknown omen");
    p.omenVote = omenId;
    this.version++;
    return ok;
  }

  // ---------------------------------------------------------------- boutique et pool

  private canUseShop(): boolean {
    return this.phase === "planning" || this.phase === "combat" || this.phase === "armory";
  }

  private rollShop(p: PlayerState): void {
    for (let i = 0; i < p.shop.length; i++) {
      if (p.shop[i]) this.returnToPool(p.shop[i]!, 1);
      p.shop[i] = null;
    }
    const odds = this.rules.shopOdds[p.level] ?? this.rules.shopOdds[MAX_LEVEL]!;
    for (let i = 0; i < p.shop.length; i++) {
      p.shop[i] = this.drawForShop(p, odds);
    }
    const owned = new Set([...p.bench, ...p.board.values()].filter((u): u is OwnedUnit => u !== null).map((u) => u.defId));
    for (const defId of owned) {
      p.missedShops.set(defId, p.shop.includes(defId) ? 0 : (p.missedShops.get(defId) ?? 0) + 1);
    }
  }

  private drawForShop(p: PlayerState, odds: readonly number[]): string | null {
    // Coût d'abord (selon le niveau), en ignorant les coûts dont le pool est vide.
    const available = [1, 2, 3, 4, 5].map((cost, i) => (this.poolHasCost(cost) ? odds[i]! : 0));
    const total = available.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let roll = this.rng.next() * total;
    let cost = 1;
    for (let i = 0; i < available.length; i++) {
      roll -= available[i]!;
      if (roll < 0) {
        cost = i + 1;
        break;
      }
    }
    // Puis l'unité, pondérée par les exemplaires restants. Une unité possédée qu'on n'a pas
    // vue depuis plusieurs boutiques gagne jusqu'à ×2 de chances (protection contre la malchance).
    return this.drawFromPool(
      (id) => this.content.units.get(id)!.cost === cost,
      (id) => 1 + Math.min(1, 0.15 * (p.missedShops.get(id) ?? 0)),
    );
  }

  private drawFromPool(filter: (defId: string) => boolean, bonus: (defId: string) => number): string | null {
    let total = 0;
    const candidates: [string, number][] = [];
    for (const [defId, count] of this.pool) {
      if (count <= 0 || !filter(defId)) continue;
      const weight = count * bonus(defId);
      candidates.push([defId, weight]);
      total += weight;
    }
    let roll = this.rng.next() * total;
    for (const [defId, weight] of candidates) {
      roll -= weight;
      if (roll < 0) {
        this.pool.set(defId, this.pool.get(defId)! - 1);
        return defId;
      }
    }
    return null;
  }

  private poolHasCost(cost: number): boolean {
    for (const [defId, count] of this.pool) {
      if (count > 0 && this.content.units.get(defId)!.cost === cost) return true;
    }
    return false;
  }

  private returnToPool(defId: string, copies: number): void {
    if (this.pool.has(defId)) this.pool.set(defId, this.pool.get(defId)! + copies);
  }

  // ---------------------------------------------------------------- unités et fusions

  private newUnit(defId: string): OwnedUnit {
    return { uid: `u${++this.uidCounter}`, defId, star: 1, items: [] };
  }

  /** Ajoute une unité au banc, en fusionnant si possible. Retourne false si impossible (banc plein). */
  private addUnit(p: PlayerState, unit: OwnedUnit): boolean {
    const slot = p.bench.indexOf(null);
    if (slot >= 0) {
      p.bench[slot] = unit;
      this.tryMerge(p);
      return true;
    }
    // Banc plein : autorisé seulement si l'unité complète une fusion.
    return this.tryMerge(p, unit);
  }

  /**
   * Fusionne 3 exemplaires identiques en une unité d'une étoile de plus (en boucle, ★1 → ★2 → ★3).
   * Pendant le combat, seules les unités du banc fusionnent ; le plateau attend la préparation.
   * `extra` est une unité pas encore placée (achat avec banc plein). Retourne true si `extra`
   * a été consommée.
   */
  private tryMerge(p: PlayerState, extra?: OwnedUnit): boolean {
    let extraUsed = false;
    for (;;) {
      type Copy = { unit: OwnedUnit; location: Location | null };
      const copies: Copy[] = [];
      if (this.phase !== "combat") {
        for (const [key, unit] of p.board) copies.push({ unit, location: boardLocation(key) });
      }
      p.bench.forEach((unit, index) => unit && copies.push({ unit, location: { zone: "bench", index } }));
      if (extra && !extraUsed) copies.push({ unit: extra, location: null });

      const groups = new Map<string, Copy[]>();
      for (const c of copies) {
        if (c.unit.star >= 3) continue;
        const key = `${c.unit.defId}#${c.unit.star}`;
        groups.set(key, [...(groups.get(key) ?? []), c]);
      }
      const group = [...groups.values()].find((g) => g.length >= 3);
      if (!group) return extraUsed;

      const used = group.slice(0, 3);
      const items = used.flatMap((c) => c.unit.items);
      const merged: OwnedUnit = {
        uid: used[0]!.unit.uid,
        defId: used[0]!.unit.defId,
        star: (used[0]!.unit.star + 1) as StarLevel,
        items: items.slice(0, MAX_ITEMS_PER_UNIT),
      };
      for (const item of items.slice(MAX_ITEMS_PER_UNIT)) this.giveItem(p, item);
      for (const c of used) {
        if (c.location) this.setUnitAt(p, c.location, null);
        else extraUsed = true;
      }
      // Le résultat va sur le plateau si un exemplaire y était, sinon sur le banc.
      const target = used.find((c) => c.location?.zone === "board")?.location ?? used.find((c) => c.location)?.location;
      if (target) this.setUnitAt(p, target, merged);
      else p.bench[p.bench.indexOf(null)] = merged;
    }
  }

  private unitAt(p: PlayerState, location: Location): OwnedUnit | null {
    if (location.zone === "bench") return p.bench[location.index] ?? null;
    return p.board.get(`${location.col},${location.row}`) ?? null;
  }

  private setUnitAt(p: PlayerState, location: Location, unit: OwnedUnit | null): void {
    if (location.zone === "bench") {
      p.bench[location.index] = unit;
      return;
    }
    const key = `${location.col},${location.row}`;
    if (unit) p.board.set(key, unit);
    else p.board.delete(key);
  }

  private validLocation(location: Location): boolean {
    if (location.zone === "bench") return Number.isInteger(location.index) && location.index >= 0 && location.index < BENCH_SIZE;
    return (
      Number.isInteger(location.col) &&
      Number.isInteger(location.row) &&
      location.col >= 0 &&
      location.col < BOARD_COLS &&
      location.row >= 0 &&
      location.row < HALF_ROWS
    );
  }

  private giveItem(p: PlayerState, item: string): void {
    if (p.items.length < ITEM_BENCH_SIZE) p.items.push(item);
  }

  private addXp(p: PlayerState, amount: number): void {
    if (p.level >= MAX_LEVEL) return;
    p.xp += amount;
    while (p.level < MAX_LEVEL && p.xp >= XP_TO_NEXT[p.level]!) {
      p.xp -= XP_TO_NEXT[p.level]!;
      p.level++;
    }
    if (p.level >= MAX_LEVEL) p.xp = 0;
  }

  // ---------------------------------------------------------------- utilitaires

  placements(p: PlayerState): Placement[] {
    return [...p.board].map(([key, unit]) => {
      const loc = boardLocation(key);
      return { defId: unit.defId, star: unit.star, hex: { col: loc.col, row: loc.row }, items: unit.items };
    });
  }

  alivePlayers(): PlayerState[] {
    return [...this.players.values()].filter((p) => p.alive);
  }

  private activePlayer(playerId: string): PlayerState | null {
    const p = this.players.get(playerId);
    return p && p.alive ? p : null;
  }

  private runBots(): void {
    for (const [id, brain] of this.botBrains) {
      if (this.players.get(id)?.alive) brain(this, id);
    }
  }

  private shuffle<T>(xs: readonly T[]): T[] {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}

function boardLocation(key: string): { zone: "board"; col: number; row: number } {
  const [col, row] = key.split(",").map(Number);
  return { zone: "board", col: col!, row: row! };
}

function outcomeFor(winner: Team | null, side: Team): "win" | "loss" | "draw" {
  return winner === null ? "draw" : winner === side ? "win" : "loss";
}

export { COMPONENTS, COMPLETED };
