// Tournoi de compositions : npm run comps
// Génère des équipes comme le ferait un joueur (noyau de synergies, ligne de front, carry
// protégé, objets répartis), les fait s'affronter et mesure :
// - le taux de victoire de chaque archétype (reroll, niveau 8 classique, gros persos) ;
// - le taux de victoire de chaque unité quand elle est sur le plateau ;
// - le taux de victoire de chaque palier de synergie actif, dans des compos mixtes.
// Objectif : tous les archétypes autour de 50 %, aucune unité ni synergie piège.
import {
  activeTraits,
  createContent,
  Rng,
  runBattle,
  TRAITS,
  UNITS,
  type Placement,
  type StarLevel,
  type UnitDef,
} from "../src/index.js";

const TEAMS_PER_ARCHETYPE = Number(process.env.TEAMS ?? 120);
const GAMES_PER_TEAM = Number(process.env.GAMES ?? 24);
const UNIT_LOW = 0.42;
const UNIT_HIGH = 0.58;
const content = createContent();
const rng = new Rng(7);

// ---------------------------------------------------------------- archétypes

interface Slot {
  costs: readonly number[];
  star: StarLevel;
}

/**
 * Plateaux de fin de partie à investissement comparable : le reroll a moins d'unités
 * mais des 3 étoiles, les gros persos ont plus d'unités mais des 1 ou 2 étoiles.
 */
const ARCHETYPES: Record<string, readonly Slot[]> = {
  "reroll 1-cost (lvl 7)": [
    ...repeat(4, { costs: [1], star: 3 }),
    ...repeat(3, { costs: [2, 3, 4], star: 2 }),
  ],
  "reroll 2-cost (lvl 7)": [
    ...repeat(3, { costs: [2], star: 3 }),
    ...repeat(4, { costs: [1, 2, 3, 4], star: 2 }),
  ],
  "reroll 3-cost (lvl 7)": [
    ...repeat(2, { costs: [3], star: 3 }),
    ...repeat(5, { costs: [1, 2, 3, 4], star: 2 }),
  ],
  "standard (lvl 8)": [
    ...repeat(3, { costs: [4], star: 2 }),
    ...repeat(5, { costs: [1, 2, 3], star: 2 }),
  ],
  "fatty (lvl 9)": [
    ...repeat(3, { costs: [5], star: 1 }),
    ...repeat(3, { costs: [4], star: 2 }),
    ...repeat(3, { costs: [2, 3], star: 2 }),
  ],
};

function repeat(n: number, value: Slot): Slot[] {
  return Array.from({ length: n }, () => value);
}

// ---------------------------------------------------------------- construction d'une équipe

const isFrontline = (u: UnitDef) => u.stats.range <= 1;
const isTank = (u: UnitDef) => u.traits.includes("guardian") || u.traits.includes("beast");
const usesAbilityPower = (u: UnitDef) =>
  u.ability.effects.some((e) => (e.kind === "damage" || e.kind === "heal") && e.scaling === "ap");

interface Team {
  archetype: string;
  units: { def: UnitDef; star: StarLevel }[];
  board: Placement[];
  traits: string[];
}

function buildTeam(archetype: string, slots: readonly Slot[]): Team {
  // Noyau : 1 à 2 synergies visées, comme un joueur qui suit une direction.
  const core = new Set<string>();
  core.add(TRAITS[rng.int(TRAITS.length)]!.id);
  if (rng.chance(0.6)) core.add(TRAITS[rng.int(TRAITS.length)]!.id);

  const chosen: { def: UnitDef; star: StarLevel }[] = [];
  // Les slots les plus chers d'abord : ce sont eux qui définissent la compo.
  const ordered = [...slots].sort((a, b) => Math.max(...b.costs) - Math.max(...a.costs));
  for (const slot of ordered) {
    const frontCount = chosen.filter((c) => isFrontline(c.def)).length;
    const candidates = UNITS.filter((u) => slot.costs.includes(u.cost) && !chosen.some((c) => c.def.id === u.id));
    let best: UnitDef | null = null;
    let bestScore = -Infinity;
    for (const u of candidates) {
      let score = rng.next() * 2;
      for (const t of u.traits) {
        if (core.has(t)) score += 3;
        if (chosen.some((c) => c.def.traits.includes(t))) score += 1;
      }
      // Un joueur garde toujours au moins 3 unités devant.
      if (frontCount < 3 && isFrontline(u)) score += 2.5;
      if (score > bestScore) {
        bestScore = score;
        best = u;
      }
    }
    if (best) chosen.push({ def: best, star: slot.star });
  }

  const board = placeTeam(chosen);
  const traits = activeTraits(chosen.map((c) => c.def), content.traits).map((a) => `${a.trait.name} ${a.breakpoint.count}`);
  return { archetype, units: chosen, board, traits };
}

/** Front en rangée 3 (tanks au centre), le reste derrière, le carry dans un coin. */
function placeTeam(units: { def: UnitDef; star: StarLevel }[]): Placement[] {
  const front = units.filter((u) => isFrontline(u.def)).sort((a, b) => Number(isTank(b.def)) - Number(isTank(a.def)));
  const back = units.filter((u) => !isFrontline(u.def)).sort((a, b) => b.def.cost - a.def.cost || b.star - a.star);

  const frontCols = [3, 2, 4, 1, 5, 0, 6];
  const backCols = [0, 6, 1, 5, 2, 4, 3];
  const placements: Placement[] = [];
  front.forEach((u, i) => {
    const row = i < 7 ? 3 : 2;
    placements.push({ defId: u.def.id, star: u.star, hex: { col: frontCols[i % 7]!, row } });
  });
  // Coin gauche ou droit au hasard, pour varier le placement.
  const flip = rng.chance(0.5);
  back.forEach((u, i) => {
    const row = i < 7 ? 0 : 1;
    const col = backCols[i % 7]!;
    placements.push({ defId: u.def.id, star: u.star, hex: { col: flip ? 6 - col : col, row } });
  });

  giveItems(placements);
  return placements;
}

/** Même nombre d'objets pour tout le monde : 3 sur le carry, 2 sur le tank principal. */
function giveItems(placements: Placement[]): void {
  const defs = placements.map((p) => content.units.get(p.defId)!);
  const carryIndex = argmax(defs, (d, i) => (isTank(d) ? -10 : 0) + d.cost * 2 + placements[i]!.star * 3);
  const tankIndex = argmax(defs, (d, i) => (i === carryIndex ? -100 : 0) + (isTank(d) ? 10 : 0) + (isFrontline(d) ? 5 : 0) + d.cost);

  const carry = defs[carryIndex]!;
  const carryItems = usesAbilityPower(carry) ? ["ambrosia", "mjolnir", "rod"] : ["gungnir", "excalibur", "sword"];
  placements[carryIndex] = { ...placements[carryIndex]!, items: carryItems };
  placements[tankIndex] = { ...placements[tankIndex]!, items: ["aegis", "golden_fleece"] };
}

function argmax<T>(xs: T[], score: (x: T, i: number) => number): number {
  let best = 0;
  xs.forEach((x, i) => {
    if (score(x, i) > score(xs[best]!, best)) best = i;
  });
  return best;
}

// ---------------------------------------------------------------- tournoi

const teams: Team[] = [];
for (const [name, slots] of Object.entries(ARCHETYPES)) {
  for (let i = 0; i < TEAMS_PER_ARCHETYPE; i++) teams.push(buildTeam(name, slots));
}

const score = new Map<Team, { wins: number; games: number }>(teams.map((t) => [t, { wins: 0, games: 0 }]));
let seed = 0;
for (const team of teams) {
  for (let g = 0; g < GAMES_PER_TEAM; g++) {
    let opponent = teams[rng.int(teams.length)]!;
    while (opponent === team) opponent = teams[rng.int(teams.length)]!;
    const swap = g % 2 === 1;
    const result = runBattle({ seed: seed++, boards: swap ? [opponent.board, team.board] : [team.board, opponent.board], content });
    const teamSide = swap ? 1 : 0;
    const value = result.winner === null ? 0.5 : result.winner === teamSide ? 1 : 0;
    for (const [t, v] of [[team, value], [opponent, 1 - value]] as const) {
      const s = score.get(t)!;
      s.wins += v;
      s.games++;
    }
  }
}

// ---------------------------------------------------------------- rapport

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

function report(title: string, groups: Map<string, Team[]>, minTeams: number, flags?: [number, number]) {
  console.log(`\n${title}\n`);
  const rows = [...groups]
    .filter(([, ts]) => ts.length >= minTeams)
    .map(([key, ts]) => {
      const s = ts.reduce((acc, t) => ({ wins: acc.wins + score.get(t)!.wins, games: acc.games + score.get(t)!.games }), { wins: 0, games: 0 });
      return { key, rate: s.wins / s.games, n: ts.length };
    })
    .sort((a, b) => b.rate - a.rate);
  for (const { key, rate, n } of rows) {
    const flag = flags ? (rate > flags[1] ? "  << too strong" : rate < flags[0] ? "  << too weak" : "") : "";
    console.log(`  ${key.padEnd(26)} ${pct(rate)}   (${n} teams)${flag}`);
  }
}

function groupBy(keys: (t: Team) => string[]): Map<string, Team[]> {
  const map = new Map<string, Team[]>();
  for (const t of teams) for (const k of keys(t)) map.set(k, [...(map.get(k) ?? []), t]);
  return map;
}

report("Archetypes", groupBy((t) => [t.archetype]), 1, [0.42, 0.58]);
report("Units (win rate of teams that play them)", groupBy((t) => t.units.map((u) => u.def.name)), 15, [UNIT_LOW, UNIT_HIGH]);
const missing = UNITS.filter((u) => !teams.some((t) => t.units.some((x) => x.def.id === u.id)));
if (missing.length) console.log(`\n  Never picked: ${missing.map((u) => u.name).join(", ")}`);
report("Active traits", groupBy((t) => t.traits), 15, [0.4, 0.6]);
report("Number of active traits", groupBy((t) => [`${t.traits.length} traits`]), 10);
