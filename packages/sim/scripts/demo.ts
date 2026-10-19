// Lance un combat d'exemple et affiche son déroulé : npm run demo
import { createContent, runBattle, type BattleEvent, type Placement } from "../src/index.js";

const content = createContent();

const olympians: Placement[] = [
  { defId: "athena", star: 1, hex: { col: 3, row: 3 }, items: ["aegis"] },
  { defId: "cyclops", star: 2, hex: { col: 2, row: 3 } },
  { defId: "achilles", star: 2, hex: { col: 4, row: 3 }, items: ["gungnir"] },
  { defId: "lamassu", star: 2, hex: { col: 1, row: 3 } },
  { defId: "medusa", star: 2, hex: { col: 2, row: 0 } },
  { defId: "zeus", star: 1, hex: { col: 3, row: 0 }, items: ["ambrosia"] },
  { defId: "selkie", star: 2, hex: { col: 4, row: 0 } },
];

const ragnarok: Placement[] = [
  { defId: "fenrir", star: 1, hex: { col: 3, row: 3 }, items: ["golden_fleece"] },
  { defId: "valkyrie", star: 2, hex: { col: 2, row: 3 } },
  { defId: "zhubajie", star: 2, hex: { col: 4, row: 3 } },
  { defId: "loki", star: 2, hex: { col: 5, row: 2 }, items: ["excalibur"] },
  { defId: "skadi", star: 2, hex: { col: 1, row: 0 } },
  { defId: "houyi", star: 2, hex: { col: 3, row: 0 }, items: ["mjolnir"] },
  { defId: "tlaloc", star: 2, hex: { col: 5, row: 0 } },
];

const result = runBattle({ seed: 2026, boards: [olympians, ragnarok], content });

const names = new Map<number, string>();
for (const e of result.events) {
  if (e.type === "spawn") names.set(e.unit, `${content.units.get(e.defId)!.name}${"*".repeat(e.star)}[${e.team === 0 ? "A" : "B"}]`);
}
const n = (id: number) => names.get(id) ?? `#${id}`;

function describe(e: BattleEvent): string | null {
  switch (e.type) {
    case "traits":
      return `Team ${e.team === 0 ? "A" : "B"} traits: ${Object.entries(e.active).map(([k, v]) => `${k} ${v}`).join(", ")}`;
    case "cast":
      return `${n(e.unit)} casts ${e.ability} on ${n(e.target)}`;
    case "stun":
      return `  ${n(e.target)} stunned ${e.durationMs} ms`;
    case "death":
      return `${n(e.unit)} is killed by ${n(e.killer)}`;
    case "end":
      return `Winner: ${e.winner === null ? "draw" : e.winner === 0 ? "A" : "B"}`;
    default:
      return null;
  }
}

for (const e of result.events) {
  const line = describe(e);
  if (line) console.log(`${(e.t / 1000).toFixed(2).padStart(6)}s  ${line}`);
}

const counts: Record<string, number> = {};
for (const e of result.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
console.log(`\nDuration ${(result.durationMs / 1000).toFixed(1)} s, ${result.events.length} events`, counts);
console.log("Survivors:", result.survivors.map((s) => `${n(s.unit)} ${s.hp} hp`).join(", ") || "none");
