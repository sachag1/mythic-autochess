// Simule des parties complètes entre 8 bots : npm run simulate -- [nombre de parties]
import { createBot, type BotStyle } from "../src/game/bot.js";
import { Game } from "../src/game/game.js";
import { OMENS_BY_ID } from "../src/game/omens.js";

const games = Number(process.argv[2] ?? 1);
const verbose = games === 1;
const placementsByStyle = new Map<BotStyle, number[]>();
const omenCount = new Map<string, number>();

for (let g = 0; g < games; g++) {
  const players = Array.from({ length: 8 }, (_, i) => ({ id: `bot${i}`, name: `Bot ${i}`, isBot: true }));
  const game = new Game({ seed: 1000 + g, players });
  const bots = new Map(players.map((p, i) => [p.id, createBot(g * 100 + i)]));
  for (const [id, bot] of bots) game.setBotBrain(id, bot.brain);
  // Les bots votent pendant la phase de présage.
  for (const [id, bot] of bots) bot.brain(game, id);

  let battles = 0;
  game.onBattle(() => battles++);
  let lastStage = 0;
  while (!game.isOver() && game.stage < 30) {
    game.tick(1000);
    if (verbose && game.stage !== lastStage && game.phase === "planning") {
      lastStage = game.stage;
      const alive = game.alivePlayers().sort((a, b) => b.hp - a.hp);
      console.log(
        `Stage ${game.stage}: ` + alive.map((p) => `${p.name} ${p.hp}hp lvl${p.level} ${p.gold}g`).join(" | "),
      );
    }
  }

  const omen = OMENS_BY_ID.get(game.omen!)!;
  omenCount.set(omen.name, (omenCount.get(omen.name) ?? 0) + 1);
  const ranking = [...game.players.values()].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99));
  for (const p of ranking) {
    const style = bots.get(p.id)!.style;
    placementsByStyle.set(style, [...(placementsByStyle.get(style) ?? []), p.placement ?? 8]);
  }

  if (verbose) {
    console.log(`\nOmen: ${omen.name}${game.omenDetail ? ` (${game.omenDetail})` : ""} - ${omen.description}`);
    console.log(`Game over at stage ${game.stage}-${game.round} after ${Math.round(game.time / 60000)} min of game time, ${battles} battles\n`);
    for (const p of ranking) {
      const bot = bots.get(p.id)!;
      const board = [...p.board.values()]
        .map((u) => `${game.content.units.get(u.defId)!.name}${"*".repeat(u.star)}${u.items.length ? `(${u.items.join(",")})` : ""}`)
        .join(", ");
      console.log(`#${p.placement} ${p.name} [${bot.style}, likes ${bot.favorite}] lvl${p.level}: ${board || "-"}`);
    }
  }
}

if (!verbose) {
  console.log(`${games} games\n\nAverage placement by bot style (lower is better):`);
  for (const [style, ps] of placementsByStyle) {
    console.log(`  ${style.padEnd(10)} ${(ps.reduce((a, b) => a + b, 0) / ps.length).toFixed(2)}  (${ps.length} bots)`);
  }
  console.log("\nOmens drawn:", Object.fromEntries(omenCount));
}
