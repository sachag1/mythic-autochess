// Équilibrage des augments : npm run augments -w @autochess/server -- [nombre de parties]
// Des parties complètes entre 8 bots qui choisissent leurs augments au hasard. Pour chaque
// augment, on mesure la place moyenne des joueurs qui l'ont pris (4,5 = neutre).
// Comme tous les joueurs ont la même rareté au même moment, on compare chaque augment à
// la moyenne de sa rareté. Cible : entre 4,1 et 4,9.
import { createBot } from "../src/game/bot.js";
import { AUGMENTS, AUGMENTS_BY_ID } from "../src/game/augments.js";
import { Game } from "../src/game/game.js";

const games = Number(process.argv[2] ?? 600);
const LOW = 4.1;
const HIGH = 4.9;
const placements = new Map<string, number[]>(AUGMENTS.map((a) => [a.id, []]));

for (let g = 0; g < games; g++) {
  const players = Array.from({ length: 8 }, (_, i) => ({ id: `bot${i}`, name: `Bot ${i}`, isBot: true }));
  const game = new Game({ seed: 50_000 + g, players });
  players.forEach((p, i) => game.setBotBrain(p.id, createBot(g * 8 + i).brain));
  for (const p of players) createBot(g * 8 + p.id.length).brain(game, p.id);
  while (!game.isOver() && game.stage < 30) game.tick(1000);
  for (const p of game.players.values()) {
    for (const id of p.augments) placements.get(id)!.push(p.placement ?? 8);
  }
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`${games} games (lower placement is better, 4.5 = neutral)\n`);
for (const tier of ["silver", "gold", "prismatic"] as const) {
  console.log(`-- ${tier}`);
  const rows = AUGMENTS.filter((a) => a.tier === tier)
    .map((a) => ({ a, n: placements.get(a.id)!.length, place: avg(placements.get(a.id)!) }))
    .sort((x, y) => x.place - y.place);
  for (const { a, n, place } of rows) {
    const flag = place < LOW ? "  << too strong" : place > HIGH ? "  << too weak" : "";
    console.log(`  ${AUGMENTS_BY_ID.get(a.id)!.name.padEnd(24)} ${place.toFixed(2)}   (${n} picks)${flag}`);
  }
}
