// Mode démo (?demo=zeus,thor,ra|medusa,anubis,fenrir) : un vrai combat calculé localement
// par la simulation (@autochess/sim, sans serveur), rejoué dans la scène 3D du jeu.
// Options : &mana=1 (mana pleine au départ : sorts immédiats), &star=2, &loop=0.
// Sert à vérifier les effets de sorts, les animations et à mesurer les images par seconde.
import { useEffect, useRef, useState } from "react";
import { createContent, runBattle, type Placement, type StarLevel } from "@autochess/sim";
import type { BattleReport } from "../net/types";
import { BoardScene } from "./BoardScene";

const content = createContent();

function board(ids: string[], star: StarLevel): Placement[] {
  // Mêlée devant (rangée 3), distance derrière.
  const front = [3, 2, 4, 1, 5, 0, 6];
  const out: Placement[] = [];
  const used = new Set<string>();
  for (const id of ids) {
    const def = content.units.get(id);
    if (!def) continue;
    const rows = def.stats.range <= 1 ? [3, 2, 1, 0] : [0, 1, 2, 3];
    place: for (const row of rows) {
      for (const col of front) {
        const key = `${col},${row}`;
        if (used.has(key)) continue;
        used.add(key);
        out.push({ defId: id, star, hex: { col, row } });
        break place;
      }
    }
  }
  return out;
}

export function Demo() {
  const host = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const [a = "zeus,thor,ra,athena", b = "medusa,anubis,hades,orochi"] = (params.get("demo") || "").split("|");
    const star = Number(params.get("star") ?? 2) as StarLevel;
    const mana = params.get("mana") === "1";
    const loop = params.get("loop") !== "0";
    const scene = new BoardScene(host.current!, { onMove: () => undefined, onSell: () => undefined, onHover: () => undefined, onDrag: () => undefined });
    Object.assign(window, { __scene: scene });
    let seed = 1;
    let timer = 0;
    const fight = () => {
      const modifiers = mana ? [{ stats: { startMana: 200 } }] : [];
      const result = runBattle({ seed: seed++, boards: [board(a.split(","), star), board(b.split(","), star)], content, modifiers: [modifiers, modifiers] });
      const report: BattleReport = { playerId: "demo", opponentId: null, ghost: false, side: 0, winner: result.winner, events: result.events };
      scene.setBattle({ report, startedAt: performance.now() }, null, null);
      const casts = result.events.filter((e) => e.type === "cast").length;
      setInfo(`${(result.durationMs / 1000).toFixed(1)} s · ${casts} sorts · vainqueur : ${result.winner === null ? "égalité" : result.winner === 0 ? "bas" : "haut"}`);
      if (loop) timer = window.setTimeout(fight, result.durationMs + 3500);
    };
    let start = 0;
    setInfo("Préchauffage des modèles…");
    void scene.prewarmUnits([...a.split(","), ...b.split(",")]).then(() => (start = window.setTimeout(fight, 500)));
    const perf = window.setInterval(() => setInfo((s) => s.replace(/ · \d+ i\/s.*$/, "") + ` · ${Math.round(scene.fps)} i/s (${scene.qualityLevel})`), 1000);
    return () => {
      clearTimeout(start);
      clearTimeout(timer);
      clearInterval(perf);
      scene.dispose();
    };
  }, []);

  return (
    <div className="game">
      <div className="board-host" ref={host} />
      <div className="backend-badge" style={{ color: "#fff", fontSize: 13, left: 12, right: "auto" }}>
        Démo · {info}
      </div>
    </div>
  );
}
