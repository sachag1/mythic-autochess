// Outil d'équilibrage : npm run balance
// Chaque unité (★2, sans objet) est placée dans une équipe standard neutre (2 tanks devant,
// 1 tireur derrière, sans synergie) et affronte la même équipe avec une autre unité.
// Comme seule l'unité testée change, l'écart de victoires mesure sa valeur dans une vraie
// composition — un mage ou un support est jugé derrière une ligne de front, pas seul.
// - Par coût : une unité plus chère doit battre en moyenne les unités moins chères.
// - Dans un même coût : on signale les unités qui gagnent trop (> 65 %) ou trop peu (< 35 %).
import { createContent, runBattle, UNITS, roleStats, adRatio, abilityValues, type Content, type Placement, type UnitDef } from "../src/index.js";

const SEEDS = 12;
const HIGH = 0.65;
const LOW = 0.35;

const FILLERS: UnitDef[] = [
  {
    id: "filler_tank",
    name: "Filler Tank",
    cost: 2,
    traits: [],
    stats: roleStats("tank", 2),
    ability: {
      name: "Brace",
      description: "",
      target: "self",
      castTimeMs: 500,
      effects: [{ kind: "shield", amount: abilityValues(2, 250), scaling: "ap", durationMs: 4000, area: { shape: "self" } }],
    },
  },
  {
    id: "filler_marksman",
    name: "Filler Marksman",
    cost: 2,
    traits: [],
    stats: roleStats("marksman", 2),
    ability: {
      name: "Aimed Shot",
      description: "",
      target: "currentTarget",
      castTimeMs: 400,
      effects: [{ kind: "damage", damageType: "physical", amount: adRatio(2), scaling: "ad", area: { shape: "single" } }],
    },
  },
];

const base = createContent();
const content: Content = { ...base, units: new Map([...base.units, ...FILLERS.map((f) => [f.id, f] as const)]) };

function team(def: UnitDef): Placement[] {
  const melee = def.stats.range <= 1;
  return [
    { defId: "filler_tank", star: 2, hex: { col: 2, row: 3 } },
    { defId: "filler_tank", star: 2, hex: { col: 4, row: 3 } },
    { defId: "filler_marksman", star: 2, hex: { col: 1, row: 0 } },
    { defId: def.id, star: 2, hex: melee ? { col: 3, row: 3 } : { col: 4, row: 0 } },
  ];
}

/** Taux de victoire de `a` contre `b` (les égalités comptent pour une demi-victoire). */
function winRate(a: UnitDef, b: UnitDef): number {
  let score = 0;
  for (let seed = 0; seed < SEEDS; seed++) {
    // On alterne les côtés pour annuler un éventuel avantage de position.
    const swap = seed % 2 === 1;
    const boards = swap ? ([team(b), team(a)] as const) : ([team(a), team(b)] as const);
    const { winner } = runBattle({ seed, boards, content });
    if (winner === null) score += 0.5;
    else if ((winner === 0) !== swap) score += 1;
  }
  return score / SEEDS;
}

const rates = new Map<string, Map<string, number>>();
for (const a of UNITS) {
  const row = new Map<string, number>();
  for (const b of UNITS) if (a !== b) row.set(b.id, winRate(a, b));
  rates.set(a.id, row);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

console.log("Cost ladder (average win rate of each cost against each cost)\n");
console.log("      " + [1, 2, 3, 4, 5].map((c) => `vs${c}`.padStart(5)).join(""));
for (const cost of [1, 2, 3, 4, 5]) {
  const cells = [1, 2, 3, 4, 5].map((other) => {
    const xs: number[] = [];
    for (const a of UNITS.filter((u) => u.cost === cost)) {
      for (const b of UNITS.filter((u) => u.cost === other && u !== a)) xs.push(rates.get(a.id)!.get(b.id)!);
    }
    return pct(avg(xs)).padStart(5);
  });
  console.log(`cost ${cost}` + cells.join(""));
}

console.log("\nWithin each cost (win rate against units of the same cost)\n");
for (const cost of [1, 2, 3, 4, 5]) {
  const tier = UNITS.filter((u) => u.cost === cost);
  const rows = tier
    .map((a) => ({ a, rate: avg(tier.filter((b) => b !== a).map((b) => rates.get(a.id)!.get(b.id)!)) }))
    .sort((x, y) => y.rate - x.rate);
  console.log(`-- cost ${cost}`);
  for (const { a, rate } of rows) {
    const flag = rate > HIGH ? "  << too strong" : rate < LOW ? "  << too weak" : "";
    console.log(`  ${a.name.padEnd(18)} ${pct(rate)}${flag}`);
  }
}

// ---------------------------------------------------------------- synergies
// Pour chaque synergie et chaque palier n : n membres (les moins chers, ★2) avec seulement
// cette synergie, contre exactement les mêmes unités sans aucune synergie. Un combat miroir
// bascule sur un rien, donc le taux de victoire sature vite : on mesure plutôt l'écart de
// PV restants (en % des PV de l'équipe). Cible : ~+15 % à 2, ~+35 % à 4, ~+55 % à 6.
import { TRAITS } from "../src/index.js";

function traitMargin(traitId: string, count: number): number {
  const members = UNITS.filter((u) => u.traits.includes(traitId))
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))
    .slice(0, count);
  const withTrait = members.map((u) => ({ ...u, traits: [traitId] }));
  const plain = members.map((u) => ({ ...u, id: `${u.id}#plain`, traits: [] }));
  const traitContent: Content = { ...base, units: new Map([...withTrait, ...plain].map((u) => [u.id, u])) };

  const board = (defs: UnitDef[]): Placement[] => {
    let front = 1;
    let back = 1;
    return defs.map((d) => ({
      defId: d.id,
      star: 2,
      hex: d.stats.range <= 1 ? { col: front++, row: 3 } : { col: back++, row: 0 },
    }));
  };

  let total = 0;
  const runs = SEEDS * 2;
  for (let seed = 0; seed < runs; seed++) {
    const swap = seed % 2 === 1;
    const boards = swap ? ([board(plain), board(withTrait)] as const) : ([board(withTrait), board(plain)] as const);
    const result = runBattle({ seed, boards, content: traitContent });
    const maxHp = [0, 0];
    for (const e of result.events) if (e.type === "spawn") maxHp[e.team]! += e.maxHp;
    const left = [0, 0];
    for (const s of result.survivors) left[s.team]! += s.hp;
    const traitTeam = swap ? 1 : 0;
    total += left[traitTeam]! / maxHp[traitTeam]! - left[1 - traitTeam]! / maxHp[1 - traitTeam]!;
  }
  return total / runs;
}

const signed = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`.padStart(6);
console.log("\nSynergies (team HP left with the trait minus without it)\n");
console.log("                  " + ["2", "4", "6"].map((c) => `x${c}`.padStart(6)).join(""));
for (const trait of TRAITS) {
  const cells = trait.breakpoints.map((bp) => signed(traitMargin(trait.id, bp.count)));
  console.log(`  ${trait.name.padEnd(16)}${cells.join("")}`);
}
