import { describe, expect, it } from "vitest";
import {
  createContent,
  hexDistance,
  hexKey,
  ITEMS,
  mirrorHex,
  neighbors,
  PVE_WAVES,
  runBattle,
  TRAITS,
  UNITS,
  type BattleEvent,
  type Hex,
  type Placement,
} from "../src/index.js";
import { mitigationMultiplier } from "../src/stats.js";

const content = createContent();

const frontline: Placement[] = [
  { defId: "cyclops", star: 1, hex: { col: 2, row: 3 } },
  { defId: "valkyrie", star: 1, hex: { col: 3, row: 3 } },
  { defId: "medusa", star: 1, hex: { col: 3, row: 0 } },
];
const backline: Placement[] = [
  { defId: "lamassu", star: 1, hex: { col: 3, row: 3 } },
  { defId: "skadi", star: 1, hex: { col: 2, row: 0 } },
  { defId: "kitsune", star: 1, hex: { col: 4, row: 0 } },
];

describe("hex grid", () => {
  it("measures distances symmetrically", () => {
    const a = { col: 1, row: 1 };
    const b = { col: 5, row: 6 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
    expect(hexDistance(a, a)).toBe(0);
  });

  it("gives neighbors at distance 1", () => {
    const center = { col: 3, row: 3 };
    const ns = neighbors(center);
    expect(ns).toHaveLength(6);
    for (const n of ns) expect(hexDistance(center, n)).toBe(1);
  });

  it("mirrors the opponent board into the top half", () => {
    expect(mirrorHex({ col: 0, row: 0 })).toEqual({ col: 6, row: 7 });
    expect(mirrorHex({ col: 3, row: 3 })).toEqual({ col: 3, row: 4 });
  });
});

describe("damage formulas", () => {
  it("halves damage at 100 resistance", () => {
    expect(mitigationMultiplier(0)).toBe(1);
    expect(mitigationMultiplier(100)).toBe(0.5);
  });
});

describe("battle", () => {
  it("is deterministic for a given seed", () => {
    const a = runBattle({ seed: 42, boards: [frontline, backline], content });
    const b = runBattle({ seed: 42, boards: [frontline, backline], content });
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it("ends with a winner and an end event", () => {
    const result = runBattle({ seed: 1, boards: [frontline, backline], content });
    expect(result.winner).not.toBeNull();
    expect(result.events.at(-1)?.type).toBe("end");
    expect(result.survivors.every((s) => s.team === result.winner)).toBe(true);
  });

  it("lets a bigger team beat a single unit", () => {
    const lone: Placement[] = [{ defId: "valkyrie", star: 1, hex: { col: 3, row: 3 } }];
    for (let seed = 0; seed < 10; seed++) {
      expect(runBattle({ seed, boards: [frontline, lone], content }).winner).toBe(0);
    }
  });

  it("makes a 2-star unit beat its 1-star copy", () => {
    let wins = 0;
    for (let seed = 0; seed < 20; seed++) {
      const result = runBattle({
        seed,
        boards: [
          [{ defId: "achilles", star: 2, hex: { col: 3, row: 3 } }],
          [{ defId: "achilles", star: 1, hex: { col: 3, row: 3 } }],
        ],
        content,
      });
      if (result.winner === 0) wins++;
    }
    expect(wins).toBe(20);
  });

  it("makes assassins leap next to the farthest enemy at combat start", () => {
    const result = runBattle({
      seed: 0,
      boards: [[{ defId: "tengu", star: 1, hex: { col: 3, row: 3 } }], backline],
      content,
    });
    const leap = result.events.find((e) => e.type === "move" && e.unit === 0);
    expect(leap?.t).toBe(0);
    // La cible la plus lointaine est en rangée 7 (ligne arrière ennemie) : on atterrit à côté.
    expect(leap && leap.type === "move" && leap.to.row).toBeGreaterThanOrEqual(6);
  });

  it("never puts two living units on the same hex", () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = runBattle({ seed, boards: [frontline, backline], content });
      assertNoOverlap(result.events);
    }
  });

  it("reports active traits", () => {
    const result = runBattle({ seed: 3, boards: [frontline, backline], content });
    const traits = result.events.find((e) => e.type === "traits" && e.team === 0);
    expect(traits).toMatchObject({ active: { greek: 2 } });
  });

  it("applies item stats", () => {
    const withBelt = runBattle({
      seed: 0,
      boards: [[{ defId: "valkyrie", star: 1, hex: { col: 3, row: 3 }, items: ["belt"] }], backline],
      content,
    });
    const spawn = withBelt.events.find((e) => e.type === "spawn" && e.unit === 0);
    expect(spawn).toMatchObject({ maxHp: content.units.get("valkyrie")!.stats.maxHp + 150 });
  });

  it("applies team modifiers only to matching units", () => {
    const result = runBattle({
      seed: 0,
      boards: [frontline, backline],
      content,
      modifiers: [[{ filter: { traits: ["greek"] }, stats: { maxHp: 100 } }], []],
    });
    const spawns = result.events.filter((e) => e.type === "spawn" && e.team === 0);
    for (const spawn of spawns) {
      if (spawn.type !== "spawn") continue;
      const def = content.units.get(spawn.defId)!;
      const expected = def.stats.maxHp + (def.traits.includes("greek") ? 100 : 0);
      expect(spawn.maxHp, def.id).toBe(expected);
    }
  });

  it("can fight every PvE wave", () => {
    for (const wave of Object.values(PVE_WAVES)) {
      const result = runBattle({ seed: 0, boards: [frontline, wave], content });
      expect(result.events.at(-1)?.type).toBe("end");
    }
  });

  it("rejects invalid boards", () => {
    const unknown: Placement[] = [{ defId: "nobody", star: 1, hex: { col: 0, row: 0 } }];
    const outside: Placement[] = [{ defId: "medusa", star: 1, hex: { col: 0, row: 5 } }];
    const stacked: Placement[] = [
      { defId: "medusa", star: 1, hex: { col: 0, row: 0 } },
      { defId: "kitsune", star: 1, hex: { col: 0, row: 0 } },
    ];
    for (const board of [unknown, outside, stacked]) {
      expect(() => runBattle({ seed: 0, boards: [board, backline], content })).toThrow();
    }
  });
});

describe("content", () => {
  it("only references existing traits", () => {
    const traitIds = new Set(TRAITS.map((t) => t.id));
    for (const unit of UNITS) {
      for (const trait of unit.traits) expect(traitIds, `${unit.id} -> ${trait}`).toContain(trait);
    }
  });

  it("has 56 units spread 12 / 12 / 12 / 12 / 8 across costs", () => {
    expect(UNITS).toHaveLength(56);
    const byCost = [1, 2, 3, 4, 5].map((cost) => UNITS.filter((u) => u.cost === cost).length);
    expect(byCost).toEqual([12, 12, 12, 12, 8]);
  });

  it("has 7 units per pantheon, each with one 5-cost", () => {
    for (const origin of TRAITS.filter((t) => t.kind === "origin")) {
      const members = UNITS.filter((u) => u.traits.includes(origin.id));
      expect(members, origin.id).toHaveLength(7);
      expect(members.filter((u) => u.cost === 5), origin.id).toHaveLength(1);
    }
  });

  it("gives every unit exactly one origin and at least one class", () => {
    const kind = new Map(TRAITS.map((t) => [t.id, t.kind]));
    for (const unit of UNITS) {
      expect(unit.traits.filter((t) => kind.get(t) === "origin"), unit.id).toHaveLength(1);
      expect(unit.traits.filter((t) => kind.get(t) === "class").length, unit.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses 2 / 4 / 6 breakpoints for every trait", () => {
    for (const trait of TRAITS) expect(trait.breakpoints.map((b) => b.count), trait.id).toEqual([2, 4, 6]);
  });

  it("has unique ids", () => {
    expect(new Set(UNITS.map((u) => u.id)).size).toBe(UNITS.length);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it("gives every trait enough units to reach its highest breakpoint", () => {
    for (const trait of TRAITS) {
      const count = UNITS.filter((u) => u.traits.includes(trait.id)).length;
      const highest = trait.breakpoints.at(-1)!.count;
      expect(count, trait.id).toBeGreaterThanOrEqual(highest);
    }
  });

  it("builds items from existing components", () => {
    const ids = new Set(ITEMS.map((i) => i.id));
    for (const item of ITEMS) {
      for (const component of item.components ?? []) expect(ids).toContain(component);
    }
  });
});

function assertNoOverlap(events: BattleEvent[]): void {
  const positions = new Map<number, Hex>();
  for (const event of events) {
    if (event.type === "spawn") positions.set(event.unit, event.hex);
    if (event.type === "move") positions.set(event.unit, event.to);
    if (event.type === "death") positions.delete(event.unit);
    const keys = [...positions.values()].map(hexKey);
    expect(new Set(keys).size).toBe(keys.length);
  }
}
