// Bots simples : ils remplacent les joueurs absents et servent à simuler des parties.
// Chaque bot a une personnalité (reroll, montée rapide, équilibré) et une synergie favorite.
import { Rng, TRAITS, type UnitDef } from "@autochess/sim";
import { COMPONENTS, type Game, type OwnedUnit, type PlayerState } from "./game.js";

export type BotStyle = "reroll" | "fast" | "balanced";

/** Niveau visé selon l'étape, par personnalité. */
const TARGET_LEVEL: Record<BotStyle, (stage: number) => number> = {
  reroll: (s) => (s <= 1 ? 3 : s === 2 ? 5 : s === 3 ? 6 : s === 4 ? 7 : 8),
  fast: (s) => (s <= 1 ? 3 : s === 2 ? 5 : s === 3 ? 7 : s === 4 ? 8 : 9),
  balanced: (s) => (s <= 1 ? 3 : s === 2 ? 5 : s === 3 ? 6 : s === 4 ? 8 : 9),
};

const MAX_REROLLS_PER_ROUND = 8;

export function createBot(seed: number, style?: BotStyle) {
  // Graines voisines = tirages voisins : on les mélange d'abord.
  const rng = new Rng(Math.imul(seed + 1, 0x9e3779b1));
  const botStyle: BotStyle = style ?? (["reroll", "fast", "balanced"] as const)[rng.int(3)]!;
  const favorite = TRAITS[rng.int(TRAITS.length)]!.id;

  const brain = (game: Game, playerId: string): void => {
    const p = game.players.get(playerId);
    if (!p?.alive) return;
    if (game.phase === "omen") {
      game.voteOmen(playerId, game.omenChoices[rng.int(game.omenChoices.length)]!);
      return;
    }
    if (game.phase === "armory") {
      pickArmory(game, p);
      return;
    }
    if (game.phase !== "planning") return;
    // Choix d'augment au hasard : les mesures d'équilibrage restent sans biais.
    if (p.augmentChoices.length) game.chooseAugment(playerId, rng.int(p.augmentChoices.length));

    const reserve = game.stage >= 3 ? (botStyle === "reroll" && p.level >= TARGET_LEVEL.reroll(game.stage) ? 10 : 30) : 0;
    buyFromShop(game, p, reserve);
    while (p.level < TARGET_LEVEL[botStyle](game.stage) && p.gold - game.rules.xpCost >= reserve) {
      if (!game.buyXp(playerId).ok) break;
    }
    // Les rerolls gratuits sont toujours utilisés.
    for (let i = 0; i < 4 && p.freeRerolls > 0; i++) {
      game.reroll(playerId);
      buyFromShop(game, p, reserve);
    }
    for (let i = 0; i < MAX_REROLLS_PER_ROUND && p.gold - game.rules.rerollCost >= Math.max(reserve, 20); i++) {
      if (!game.reroll(playerId).ok) break;
      buyFromShop(game, p, reserve);
    }
    arrangeBoard(game, p);
    equipItems(game, p);
  };

  function unitScore(game: Game, p: PlayerState, def: UnitDef): number {
    const owned = ownedUnits(p).filter((u) => u.defId === def.id).length;
    const sharedTraits = def.traits.filter((t) => ownedUnits(p).some((u) => game.content.units.get(u.defId)!.traits.includes(t))).length;
    const favored = def.traits.includes(favorite) ? 2 : 0;
    const costWeight = botStyle === "reroll" ? (def.cost <= 2 ? 2 : 0) : def.cost * 0.6;
    return owned * 3 + sharedTraits + favored + costWeight;
  }

  function buyFromShop(game: Game, p: PlayerState, reserve: number): void {
    for (let i = 0; i < p.shop.length; i++) {
      const defId = p.shop[i];
      if (!defId) continue;
      const def = game.content.units.get(defId)!;
      if (p.gold - def.cost < reserve) continue;
      if (unitScore(game, p, def) < 2.5) continue;
      if (!p.bench.includes(null)) sellWorstBenchUnit(game, p, def.id);
      game.buy(p.id, i);
    }
  }

  function sellWorstBenchUnit(game: Game, p: PlayerState, keep: string): void {
    let worst = -1;
    let worstScore = Infinity;
    p.bench.forEach((u, i) => {
      if (!u || u.defId === keep) return;
      const score = unitScore(game, p, game.content.units.get(u.defId)!) + u.star * 4;
      if (score < worstScore) {
        worstScore = score;
        worst = i;
      }
    });
    if (worst >= 0) game.sell(p.id, { zone: "bench", index: worst });
  }

  function arrangeBoard(game: Game, p: PlayerState): void {
    const units = ownedUnits(p);
    const value = (u: OwnedUnit) => {
      const def = game.content.units.get(u.defId)!;
      return def.cost * u.star ** 2 + unitScore(game, p, def) * 0.5 + u.items.length * 2;
    };
    const chosen = [...units].sort((a, b) => value(b) - value(a)).slice(0, p.level);
    const front = chosen.filter((u) => game.content.units.get(u.defId)!.stats.range <= 1);
    const back = chosen.filter((u) => game.content.units.get(u.defId)!.stats.range > 1);
    const frontCols = [3, 2, 4, 1, 5, 0, 6];
    const backCols = [0, 6, 1, 5, 2, 4, 3];
    const layout = [
      ...front.map((u, i) => ({ uid: u.uid, col: frontCols[i % 7]!, row: i < 7 ? 3 : 2 })),
      ...back.map((u, i) => ({ uid: u.uid, col: backCols[i % 7]!, row: i < 7 ? 0 : 1 })),
    ];
    game.arrange(p.id, layout);
  }

  function equipItems(game: Game, p: PlayerState): void {
    // Objets sur le carry (unité la plus chère hors ligne de front), puis sur le premier tank.
    const board = [...p.board.entries()].map(([key, unit]) => {
      const [col, row] = key.split(",").map(Number);
      return { unit, col: col!, row: row!, def: game.content.units.get(unit.defId)! };
    });
    const carry = [...board].filter((b) => b.def.stats.range > 1).sort((a, b) => b.def.cost * b.unit.star - a.def.cost * a.unit.star)[0];
    const tank = board.find((b) => b.def.stats.range <= 1);
    for (const target of [carry, tank]) {
      if (!target) continue;
      for (let guard = 0; guard < 6 && p.items.length; guard++) {
        // Composant suivant : de préférence un qui se combine avec le dernier objet porté.
        const index = Math.max(0, p.items.findIndex((i) => COMPONENTS.includes(i)));
        if (!game.equip(p.id, index, { zone: "board", col: target.col, row: target.row }).ok) break;
      }
    }
  }

  function pickArmory(game: Game, p: PlayerState): void {
    if (game.armoryPicker !== p.id) return;
    let best = -1;
    let bestScore = -Infinity;
    game.armory.forEach((offer, i) => {
      if (offer.takenBy) return;
      const score = unitScore(game, p, game.content.units.get(offer.defId)!) + rng.next();
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) game.pickArmory(p.id, best);
  }

  return { brain, style: botStyle, favorite };
}

function ownedUnits(p: PlayerState): OwnedUnit[] {
  return [...p.bench, ...p.board.values()].filter((u): u is OwnedUnit => u !== null);
}
