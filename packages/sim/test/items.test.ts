import { describe, expect, it } from "vitest";
import {
  createContent,
  ITEMS,
  runBattle,
  type BattleEvent,
  type Content,
  type ItemDef,
  type Modifier,
  type Placement,
  type TriggerDef,
} from "../src/index.js";
import { mitigationMultiplier } from "../src/stats.js";

const content = createContent();
const COMPONENTS = ITEMS.filter((i) => !i.components);
const COMPLETED = ITEMS.filter((i) => i.components);

/** Contenu de test : le contenu réel + un objet sur mesure "probe". */
function withProbe(...triggers: TriggerDef[]): Content {
  const probe: ItemDef = { id: "probe", name: "Probe", description: "", stats: {}, triggers };
  return { ...content, items: new Map([...content.items, ["probe", probe]]) };
}

/** Une unité seule de chaque côté, face à face (distance 1). Seules, elles n'activent aucune synergie. */
function duel(
  a: Omit<Placement, "hex" | "star">,
  b: Omit<Placement, "hex" | "star">,
  battleContent = content,
  modifiers?: readonly [readonly Modifier[], readonly Modifier[]],
) {
  return runBattle({
    seed: 3,
    boards: [[{ ...a, star: 1, hex: { col: 3, row: 3 } }], [{ ...b, star: 1, hex: { col: 3, row: 3 } }]],
    content: battleContent,
    modifiers,
  });
}

const ofType = <T extends BattleEvent["type"]>(events: BattleEvent[], type: T) =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

const NO_CRIT: Modifier = { stats: { critChance: -1 } };

describe("item recipes", () => {
  it("has 8 components and 36 completed items", () => {
    expect(COMPONENTS.map((c) => c.id).sort()).toEqual(["belt", "bow", "cloak", "glove", "rod", "sword", "tear", "vest"]);
    expect(COMPLETED).toHaveLength(36);
  });

  it("builds completed items only from components", () => {
    const componentIds = new Set(COMPONENTS.map((c) => c.id));
    for (const item of COMPLETED) {
      for (const c of item.components!) expect(componentIds, `${item.id} -> ${c}`).toContain(c);
    }
  });

  it("has exactly one recipe per pair of components, duplicates included", () => {
    const key = (a: string, b: string) => [a, b].sort().join("+");
    const recipes = new Map<string, string[]>();
    for (const item of COMPLETED) {
      const k = key(...item.components!);
      recipes.set(k, [...(recipes.get(k) ?? []), item.id]);
    }
    const ids = COMPONENTS.map((c) => c.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i; j < ids.length; j++) {
        expect(recipes.get(key(ids[i]!, ids[j]!)), key(ids[i]!, ids[j]!)).toHaveLength(1);
      }
    }
    expect(recipes.size).toBe(36);
  });

  it("gives every item a unique id and name and a description", () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(new Set(ITEMS.map((i) => i.name)).size).toBe(ITEMS.length);
    for (const item of ITEMS) expect(item.description.length, item.id).toBeGreaterThan(0);
  });

  it("keeps at least the stats of its components", () => {
    for (const item of COMPLETED) {
      const [a, b] = item.components!;
      const expected: Record<string, number> = {};
      for (const c of a === b ? [a] : [a, b]) {
        for (const [stat, value] of Object.entries(content.items.get(c)!.stats)) expected[stat] = value;
      }
      for (const [stat, value] of Object.entries(expected)) {
        expect((item.stats as Record<string, number>)[stat] ?? 0, `${item.id}.${stat}`).toBeGreaterThanOrEqual(value);
      }
    }
  });

  it("lets every item fight without error, deterministically", () => {
    for (const item of COMPLETED) {
      const board: Placement[] = [
        { defId: "cyclops", star: 2, hex: { col: 3, row: 3 }, items: [item.id] },
        { defId: "medusa", star: 2, hex: { col: 0, row: 0 }, items: [item.id] },
        { defId: "skadi", star: 2, hex: { col: 6, row: 0 }, items: [item.id] },
      ];
      const opponents: Placement[] = [
        { defId: "lamassu", star: 2, hex: { col: 3, row: 3 }, items: ["svalinn"] },
        { defId: "kitsune", star: 2, hex: { col: 2, row: 0 }, items: ["xiuhcoatl"] },
        { defId: "tengu", star: 2, hex: { col: 4, row: 1 }, items: ["eye_of_ra"] },
      ];
      const a = runBattle({ seed: 5, boards: [board, opponents], content });
      const b = runBattle({ seed: 5, boards: [board, opponents], content });
      expect(a.events.at(-1)?.type, item.id).toBe("end");
      expect(JSON.stringify(a.events), item.id).toBe(JSON.stringify(b.events));
    }
  });
});

describe("item effects", () => {
  it("burns for a % of max health every second, without stacking", () => {
    const burn: TriggerDef = {
      on: "combatStart",
      target: "farthestEnemy",
      effects: [{ kind: "burn", percentMaxHp: 10, durationMs: 3000, area: { shape: "single" } }],
    };
    const result = duel({ defId: "medusa", items: ["probe"] }, { defId: "kitsune" }, withProbe(burn, burn));
    expect(ofType(result.events, "burn")).toHaveLength(2);
    const ticks = ofType(result.events, "damage").filter((e) => e.damageType === "true" && e.source === 0);
    const maxHp = content.units.get("kitsune")!.stats.maxHp;
    expect(ticks.map((e) => e.t)).toEqual([1000, 2000, 3000]);
    for (const tick of ticks) expect(tick.amount + tick.shieldAbsorbed).toBe(Math.round(maxHp * 0.1));
  });

  it("does not give mana from burn damage", () => {
    const burn: TriggerDef = {
      on: "combatStart",
      target: "farthestEnemy",
      effects: [{ kind: "burn", percentMaxHp: 10, durationMs: 3000, area: { shape: "single" } }],
    };
    // Un étourdissement long empêche la cible d'attaquer : sa mana ne bouge qu'avec les dégâts reçus.
    const stun: TriggerDef = { on: "combatStart", target: "farthestEnemy", effects: [{ kind: "stun", durationMs: [5000, 5000, 5000], area: { shape: "single" } }] };
    const result = runBattle({
      seed: 0,
      boards: [[{ defId: "medusa", star: 1, hex: { col: 0, row: 0 }, items: ["probe"] }], [{ defId: "lamassu", star: 1, hex: { col: 0, row: 0 } }]],
      content: withProbe(burn, stun),
    });
    let mana = content.units.get("lamassu")!.stats.startMana;
    let ticks = 0;
    for (const e of ofType(result.events, "damage").filter((d) => d.target === 1)) {
      if (e.damageType === "true") {
        expect(e.mana).toBe(mana);
        ticks++;
      }
      mana = e.mana;
    }
    expect(ticks).toBe(3);
  });

  it("reduces healing with wounds", () => {
    const hit = (wound: boolean): TriggerDef => ({
      on: "combatStart",
      target: "farthestEnemy",
      effects: [
        { kind: "damage", damageType: "true", amount: [300, 300, 300], scaling: "none", area: { shape: "single" } },
        ...(wound ? [{ kind: "wound" as const, percent: 50, durationMs: 10000, area: { shape: "single" as const } }] : []),
      ],
    });
    const firstHeal = (wound: boolean) => {
      const result = duel({ defId: "medusa", items: ["probe"] }, { defId: "lamassu", items: ["golden_fleece"] }, withProbe(hit(wound)));
      if (wound) expect(ofType(result.events, "wound")).toHaveLength(1);
      return ofType(result.events, "heal").find((e) => e.target === 1)!.amount;
    };
    expect(firstHeal(false)).toBe(50);
    expect(firstHeal(true)).toBe(25);
  });

  it("cuts armor with sunder", () => {
    const sunder: TriggerDef = {
      on: "combatStart",
      target: "farthestEnemy",
      effects: [{ kind: "sunder", stat: "armor", percent: 50, durationMs: 20000, area: { shape: "single" } }],
    };
    const firstHit = (withSunder: boolean) => {
      const result = duel(
        { defId: "valkyrie", items: withSunder ? ["probe"] : [] },
        { defId: "lamassu" },
        withProbe(sunder),
        [[NO_CRIT], []],
      );
      return ofType(result.events, "damage").find((e) => e.source === 0 && e.damageType === "physical")!;
    };
    const valkyrie = content.units.get("valkyrie")!.stats.attackDamage;
    const armor = content.units.get("lamassu")!.stats.armor;
    const hit = (h: ReturnType<typeof firstHit>) => h.amount + h.shieldAbsorbed;
    expect(hit(firstHit(false))).toBe(Math.round(valkyrie * mitigationMultiplier(armor)));
    expect(hit(firstHit(true))).toBe(Math.round(valkyrie * mitigationMultiplier(armor / 2)));
  });

  it("protects from stuns with Talaria, whatever the unit order", () => {
    const stuns = (talaria: boolean) => {
      const result = duel({ defId: "lamassu", items: ["tamatebako"] }, { defId: "skadi", items: talaria ? ["talaria"] : [] });
      return ofType(result.events, "stun").filter((e) => e.source === 0 && e.t === 0);
    };
    expect(stuns(false)).toHaveLength(1);
    expect(stuns(true)).toHaveLength(0);
  });

  it("grows Kusanagi's attack damage on each takedown", () => {
    const result = duel({ defId: "achilles", items: ["kusanagi"] }, { defId: "satyr" });
    const death = ofType(result.events, "death").find((e) => e.killer === 0)!;
    const buff = ofType(result.events, "buff").find((e) => e.target === 0 && e.stat === "attackDamage");
    expect(buff).toMatchObject({ t: death.t, amount: 10 });
  });

  it("burns on critical strikes with the Eye of Ra", () => {
    const result = duel({ defId: "valkyrie", items: ["eye_of_ra"] }, { defId: "lamassu" }, content, [[{ stats: { critChance: 1 } }], []]);
    const firstAttack = ofType(result.events, "attack").find((e) => e.unit === 0)!;
    expect(firstAttack.crit).toBe(true);
    expect(ofType(result.events, "burn").find((e) => e.source === 0)?.t).toBe(firstAttack.t);
  });

  it("respects the cooldown and the limit of on-damage triggers", () => {
    const result = runBattle({
      seed: 1,
      boards: [
        [{ defId: "cyclops", star: 2, hex: { col: 3, row: 3 }, items: ["yata_no_kagami"] }],
        [
          { defId: "valkyrie", star: 2, hex: { col: 3, row: 3 } },
          { defId: "jiangshi", star: 2, hex: { col: 2, row: 3 } },
          { defId: "satyr", star: 2, hex: { col: 3, row: 0 } },
        ],
      ],
      content,
    });
    const stacks = ofType(result.events, "buff").filter((e) => e.target === 0 && e.stat === "attackDamage");
    expect(stacks.length).toBeGreaterThan(5);
    expect(stacks.length).toBeLessThanOrEqual(15);
    for (let i = 1; i < stacks.length; i++) expect(stacks[i]!.t - stacks[i - 1]!.t).toBeGreaterThanOrEqual(750);
  });

  it("fires hpBelow triggers once, under the threshold, scaled on max health", () => {
    const result = duel({ defId: "jiangshi", items: ["plant_of_heartbeat"] }, { defId: "achilles" });
    const heals = ofType(result.events, "heal").filter((e) => e.source === 0 && e.target === 0);
    const maxHp = ofType(result.events, "spawn").find((e) => e.unit === 0)!.maxHp;
    const plant = heals.find((e) => e.amount === Math.round(maxHp * 0.35));
    expect(plant).toBeDefined();
    const before = ofType(result.events, "damage").filter((e) => e.target === 0 && e.t <= plant!.t).at(-1)!;
    expect(before.hp).toBeLessThan(maxHp * 0.35);
    expect(heals.filter((e) => e.amount === plant!.amount)).toHaveLength(1);
  });

  it("slows enemy attacks with Imhullu", () => {
    const attacks = (imhullu: boolean) => {
      const result = duel({ defId: "lamassu", items: imhullu ? ["imhullu"] : [] }, { defId: "valkyrie" });
      return ofType(result.events, "attack").filter((e) => e.unit === 1 && e.t <= 10000).length;
    };
    expect(attacks(true)).toBeLessThan(attacks(false));
  });

  it("deals damage around the wearer when hit with the Nemean Lion Hide", () => {
    const result = duel({ defId: "lamassu", items: ["nemean_hide"] }, { defId: "valkyrie" });
    const thorns = ofType(result.events, "damage").filter((e) => e.source === 0 && e.damageType === "magic" && e.amount + e.shieldAbsorbed > 0);
    expect(thorns.length).toBeGreaterThan(0);
    for (let i = 1; i < thorns.length; i++) expect(thorns[i]!.t - thorns[i - 1]!.t).toBeGreaterThanOrEqual(1500);
  });
});
