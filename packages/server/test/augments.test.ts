import { describe, expect, it } from "vitest";
import { runBattle } from "@autochess/sim";
import { AUGMENT_ROUNDS, AUGMENTS, AUGMENTS_BY_ID, TIER_PATTERNS } from "../src/game/augments.js";
import { Game } from "../src/game/game.js";

function newGame(count = 2, seed = 1): Game {
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  return new Game({ seed, players });
}

/** Avance jusqu'à la préparation du round donné. */
function toRound(game: Game, stage: number, round: number): void {
  for (let i = 0; i < 300 && !(game.phase === "planning" && game.stage === stage && game.round === round); i++) {
    // Les joueurs restent en vie pour la durée du test.
    for (const p of game.players.values()) p.hp = 100;
    game.skipPhase();
  }
  expect(game.phase).toBe("planning");
}

describe("augments", () => {
  it("has unique ids and enough augments of every tier for 3 picks with a reroll", () => {
    expect(AUGMENTS_BY_ID.size).toBe(AUGMENTS.length);
    for (const tier of ["silver", "gold", "prismatic"] as const) {
      expect(AUGMENTS.filter((a) => a.tier === tier).length, tier).toBeGreaterThanOrEqual(9);
    }
    for (const pattern of TIER_PATTERNS) expect(pattern).toHaveLength(AUGMENT_ROUNDS.length);
  });

  it("offers 3 augments of the same tier to every player at 2-1", () => {
    const game = newGame(3, 2);
    toRound(game, 2, 1);
    const tier = game.augmentTiers[0];
    for (const p of game.players.values()) {
      expect(p.augmentChoices).toHaveLength(3);
      expect(new Set(p.augmentChoices).size).toBe(3);
      for (const id of p.augmentChoices) expect(AUGMENTS_BY_ID.get(id)!.tier).toBe(tier);
    }
  });

  it("applies an augment when chosen, and only once", () => {
    const game = newGame(2, 3);
    toRound(game, 2, 1);
    const p = game.players.get("p0")!;
    p.augmentChoices = ["charon_obol", "lucky_scarab", "smith_satchel"];
    const gold = p.gold;
    expect(game.chooseAugment("p0", 0).ok).toBe(true);
    expect(p.gold).toBe(gold + 9);
    expect(p.augments).toEqual(["charon_obol"]);
    expect(game.chooseAugment("p0", 0).ok).toBe(false);
  });

  it("allows one reroll of the offer", () => {
    const game = newGame(2, 4);
    toRound(game, 2, 1);
    const p = game.players.get("p0")!;
    const before = [...p.augmentChoices];
    expect(game.rerollAugments("p0").ok).toBe(true);
    expect(p.augmentChoices.some((id) => before.includes(id))).toBe(false);
    expect(game.rerollAugments("p0").ok).toBe(false);
  });

  it("picks an augment at random when the player does not choose", () => {
    const game = newGame(2, 5);
    toRound(game, 2, 1);
    game.skipPhase();
    for (const p of game.players.values()) {
      expect(p.augments).toHaveLength(1);
      expect(p.augmentChoices).toHaveLength(0);
    }
  });

  it("gives 3 augments over a full game", () => {
    const game = newGame(2, 6);
    toRound(game, 4, 2);
    game.skipPhase();
    for (const p of game.players.values()) expect(p.augments).toHaveLength(3);
  });

  it("applies per-round bonuses and combat modifiers", () => {
    const game = newGame(2, 7);
    toRound(game, 2, 1);
    const p = game.players.get("p0")!;
    p.augmentChoices = ["lucky_scarab", "bronze_skin", "smith_satchel"];
    game.chooseAugment("p0", 0);
    p.augmentChoices = ["bronze_skin"];
    game.chooseAugment("p0", 0);

    const result = runBattle({
      seed: 0,
      boards: [[{ defId: "valkyrie", star: 1, hex: { col: 3, row: 3 } }], [{ defId: "valkyrie", star: 1, hex: { col: 3, row: 3 } }]],
      content: game.content,
      modifiers: [game.modifiersFor(p), []],
    });
    const spawns = result.events.filter((e) => e.type === "spawn");
    const hp = spawns.map((e) => (e.type === "spawn" ? e.maxHp : 0));
    expect(hp[0]! - hp[1]!).toBe(100);

    // Lucky Scarab : +1 or au début de la préparation suivante.
    const q = game.players.get("p1")!;
    p.gold = q.gold = 0;
    p.streak = q.streak = 0;
    q.augments = [];
    q.augmentChoices = [];
    toRound(game, 2, 2);
    expect(p.gold - q.gold).toBe(1);
  });
});
