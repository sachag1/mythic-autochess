import { describe, expect, it } from "vitest";
import { POOL_SIZE_BY_COST } from "@autochess/sim";
import { createBot } from "../src/game/bot.js";
import { Game, type OwnedUnit, type PlayerState } from "../src/game/game.js";
import { OMENS } from "../src/game/omens.js";

function newGame(count = 2, seed = 1): Game {
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  return new Game({ seed, players });
}

/** Avance jusqu'à la prochaine phase de préparation. */
function toPlanning(game: Game): void {
  for (let i = 0; i < 50 && game.phase !== "planning"; i++) game.skipPhase();
}

function player(game: Game, id = "p0"): PlayerState {
  return game.players.get(id)!;
}

function owned(p: PlayerState): OwnedUnit[] {
  return [...p.bench, ...p.board.values()].filter((u): u is OwnedUnit => u !== null);
}

/** Met une unité précise dans la boutique en la prenant au pool (comptabilité respectée). */
function stockShop(game: Game, p: PlayerState, slot: number, defId: string): void {
  const previous = p.shop[slot];
  if (previous) game.pool.set(previous, game.pool.get(previous)! + 1);
  game.pool.set(defId, game.pool.get(defId)! - 1);
  p.shop[slot] = defId;
}

describe("omens", () => {
  it("offers 3 different omens and picks one of them", () => {
    const game = newGame();
    expect(new Set(game.omenChoices).size).toBe(3);
    game.voteOmen("p0", game.omenChoices[1]!);
    game.skipPhase();
    expect(game.omenChoices).toContain(game.omen);
  });

  it("only accepts votes during the omen phase", () => {
    const game = newGame();
    expect(game.voteOmen("p0", "not_an_omen").ok).toBe(false);
    game.skipPhase();
    expect(game.voteOmen("p0", game.omenChoices[0]!).ok).toBe(false);
  });

  it("defines every omen with a herald from the roster", () => {
    const game = newGame();
    for (const omen of OMENS) expect(game.content.units.has(omen.herald), omen.id).toBe(true);
  });
});

describe("shop and economy", () => {
  it("buys a unit to the bench and spends gold", () => {
    const game = newGame();
    toPlanning(game);
    const p = player(game);
    p.gold = 10;
    stockShop(game, p, 0, "medusa");
    expect(game.buy("p0", 0).ok).toBe(true);
    expect(p.gold).toBe(9);
    expect(owned(p).some((u) => u.defId === "medusa")).toBe(true);
    expect(p.shop[0]).toBeNull();
  });

  it("refuses to buy without gold", () => {
    const game = newGame();
    toPlanning(game);
    const p = player(game);
    p.gold = 0;
    stockShop(game, p, 0, "zeus");
    expect(game.buy("p0", 0)).toEqual({ ok: false, error: "Not enough gold" });
  });

  it("merges three copies into a 2-star, and nine into a 3-star", () => {
    const game = newGame();
    toPlanning(game);
    const p = player(game);
    p.gold = 100;
    p.bench.fill(null);
    p.board.clear();
    for (let i = 0; i < 9; i++) {
      stockShop(game, p, 0, "medusa");
      expect(game.buy("p0", 0).ok).toBe(true);
      if (i === 2) expect(owned(p).filter((u) => u.defId === "medusa").map((u) => u.star)).toEqual([2]);
    }
    expect(owned(p).filter((u) => u.defId === "medusa").map((u) => u.star)).toEqual([3]);
  });

  it("keeps the shared pool consistent through rolls, buys and sells", () => {
    const game = newGame(4, 9);
    toPlanning(game);
    const total = () => {
      const counts = new Map(game.pool);
      for (const p of game.players.values()) {
        for (const id of p.shop) if (id) counts.set(id, counts.get(id)! + 1);
        for (const u of owned(p)) counts.set(u.defId, counts.get(u.defId)! + { 1: 1, 2: 3, 3: 9 }[u.star]);
      }
      return counts;
    };
    const p = player(game);
    p.gold = 200;
    for (let i = 0; i < 30; i++) {
      game.reroll("p0");
      game.buy("p0", 0);
      if (i % 4 === 0) game.sell("p0", { zone: "bench", index: 0 });
    }
    for (const [defId, count] of total()) {
      const cost = game.content.units.get(defId)!.cost;
      expect(count, defId).toBe(POOL_SIZE_BY_COST[cost]);
    }
  });

  it("levels up with experience and limits the board to the level", () => {
    const game = newGame();
    toPlanning(game);
    const p = player(game);
    p.gold = 100;
    p.bench.fill(null);
    p.board.clear();
    const startLevel = p.level;
    expect(game.buyXp("p0").ok).toBe(true);
    expect(p.level).toBeGreaterThan(startLevel);

    for (const defId of ["medusa", "kitsune", "selkie", "lamassu", "valkyrie", "bastet"]) {
      stockShop(game, p, 0, defId);
      game.buy("p0", 0);
    }
    let placed = 0;
    for (let index = 0; index < 6; index++) {
      if (game.move("p0", { zone: "bench", index }, { zone: "board", col: index, row: 0 }).ok) placed++;
    }
    expect(placed).toBe(Math.min(6, p.level));
  });

  it("combines two components into a completed item", () => {
    const game = newGame();
    toPlanning(game);
    const p = player(game);
    p.gold = 10;
    p.bench.fill(null);
    stockShop(game, p, 0, "valkyrie");
    game.buy("p0", 0);
    p.items = ["sword", "bow"];
    const at = { zone: "bench" as const, index: p.bench.findIndex((u) => u?.defId === "valkyrie") };
    expect(game.equip("p0", 0, at).ok).toBe(true);
    expect(game.equip("p0", 0, at).ok).toBe(true);
    expect(p.bench[at.index]!.items).toEqual(["gungnir"]);
    expect(p.items).toEqual([]);
  });

  it("raises the odds of an owned unit after several missed shops", () => {
    const game = newGame();
    toPlanning(game);
    const p = player(game);
    p.gold = 100;
    p.bench.fill(null);
    stockShop(game, p, 0, "zeus");
    p.gold = 100;
    game.buy("p0", 0);
    for (let i = 0; i < 5; i++) game.reroll("p0");
    // Niveau bas : Zeus (5 pièces) ne peut pas apparaître, le compteur grimpe à chaque boutique.
    expect(p.missedShops.get("zeus")).toBe(5);
  });
});

describe("PvE", () => {
  it("never damages players during stage 1, even with an empty board", () => {
    const game = newGame(2, 21);
    for (let i = 0; i < 50 && game.stage === 1; i++) {
      for (const p of game.players.values()) {
        p.bench.fill(null);
        p.board.clear();
      }
      game.skipPhase();
    }
    for (const p of game.players.values()) expect(p.hp).toBe(100);
  });

  it("gives every player the same loot over 4 PvE rounds, whatever the order", () => {
    const players = Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true }));
    const game = new Game({ seed: 22, players });
    players.forEach((p, i) => game.setBotBrain(p.id, createBot(i).brain));
    const kinds = new Map(players.map((p) => [p.id, [] as string[]]));
    let lastKey = "";
    for (let i = 0; i < 20_000 && !game.isOver() && game.stage <= 3; i++) {
      game.tick(1000);
      const key = `${game.stage}-${game.round}-${game.phase}`;
      if (key !== lastKey && game.phase !== "combat") {
        for (const p of game.players.values()) {
          if (p.lastLoot.length && lastKey.endsWith("combat")) kinds.get(p.id)!.push(p.lastLoot[0]!.split(":")[0]!);
        }
      }
      lastKey = key;
    }
    // 4 rounds PvE en étapes 1 à 3 (1-2, 1-3, 1-4, 2-7) : 2 objets, 1 or, 1 champion pour chacun.
    for (const [id, got] of kinds) {
      const first4 = got.slice(0, 4).map((k) => (k === "unit" || k === "sold" ? "champion" : k)).sort();
      expect(first4, id).toEqual(["gold", "item", "item", "champion"].sort());
    }
  });
});

describe("auto-fill", () => {
  it("moves the best bench units onto empty board slots when combat starts", () => {
    const game = newGame(2, 11);
    toPlanning(game);
    const p = player(game);
    p.gold = 100;
    p.bench.fill(null);
    p.board.clear();
    p.level = 2;
    for (const defId of ["medusa", "valkyrie", "zeus"]) {
      stockShop(game, p, 0, defId);
      game.buy("p0", 0);
    }
    game.skipPhase();
    expect(game.phase).toBe("combat");
    const onBoard = [...p.board.values()].map((u) => u.defId).sort();
    // Niveau 2 : les deux unités les plus chères (Zeus, puis Medusa ou Valkyrie) sont placées.
    expect(onBoard).toHaveLength(2);
    expect(onBoard).toContain("zeus");
    expect(owned(p)).toHaveLength(3);
    expect(p.board.has("3,0")).toBe(true); // Zeus (distance) au centre de la rangée arrière
  });

  it("leaves a full board untouched", () => {
    const game = newGame(2, 12);
    toPlanning(game);
    const p = player(game);
    p.gold = 100;
    p.bench.fill(null);
    p.board.clear();
    p.level = 1;
    stockShop(game, p, 0, "medusa");
    game.buy("p0", 0);
    game.move("p0", { zone: "bench", index: p.bench.findIndex((u) => u !== null) }, { zone: "board", col: 0, row: 1 });
    stockShop(game, p, 0, "zeus");
    game.buy("p0", 0);
    game.skipPhase();
    expect([...p.board.keys()]).toEqual(["0,1"]);
    expect(p.bench.some((u) => u?.defId === "zeus")).toBe(true);
  });
});

describe("rounds", () => {
  it("lets the lowest-health player pick first in the armory", () => {
    const game = newGame(3, 4);
    // Avance jusqu'à la deuxième armurerie (étape 2, round 4).
    for (let i = 0; i < 200 && !(game.phase === "armory" && game.stage === 2); i++) {
      if (game.phase === "planning") {
        player(game, "p1").hp = 40;
        player(game, "p2").hp = 70;
      }
      game.skipPhase();
    }
    expect(game.phase).toBe("armory");
    expect(game.armoryPicker).toBe(game.armoryOrder[0]);
    const hps = game.armoryOrder.map((id) => player(game, id).hp);
    expect([...hps].sort((a, b) => a - b)).toEqual(hps);
  });

  it("sends battle reports to both players of a PvP round", () => {
    const game = newGame(2, 5);
    const reports: string[] = [];
    game.onBattle((r) => reports.push(r.playerId));
    for (let i = 0; i < 100 && !(game.stage === 2 && game.phase === "combat"); i++) game.skipPhase();
    expect(reports.filter((id) => id === "p0").length).toBeGreaterThan(0);
    expect(reports.filter((id) => id === "p1").length).toBeGreaterThan(0);
  });

  it("plays a full game of 8 bots to a single winner", () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true }));
    const game = new Game({ seed: 77, players });
    players.forEach((p, i) => game.setBotBrain(p.id, createBot(i).brain));
    for (let i = 0; i < 20_000 && !game.isOver(); i++) game.tick(1000);
    expect(game.isOver()).toBe(true);
    const placements = [...game.players.values()].map((p) => p.placement).sort();
    expect(placements).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("is deterministic for a given seed", () => {
    const run = () => {
      const players = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true }));
      const game = new Game({ seed: 123, players });
      players.forEach((p, i) => game.setBotBrain(p.id, createBot(i).brain));
      for (let i = 0; i < 20_000 && !game.isOver(); i++) game.tick(1000);
      return [...game.players.values()].map((p) => `${p.id}:${p.placement}`).join(",");
    };
    expect(run()).toBe(run());
  });
});
