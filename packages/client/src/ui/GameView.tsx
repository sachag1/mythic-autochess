import { useEffect, useRef, useState } from "react";
import { actions, useStore } from "../net/store";
import { BoardScene, type HoverInfo } from "../scene/BoardScene";
import { ItemChip } from "./common";
import { autoArrange, ItemBench, PlayersPanel, ShopBar, TopBar, TraitsPanel } from "./Hud";
import { Armory, AugmentPicker, BattleBanner, Eliminated, GameOver, OmenVote, ScoutPill, Toasts, UnitTooltip } from "./Overlays";

/** Écran de jeu : plateau 3D plein écran et interface par-dessus. */
export function GameView() {
  const game = useStore((s) => s.game)!;
  const sessionId = useStore((s) => s.sessionId);
  const battle = useStore((s) => s.battle);
  const ranking = useStore((s) => s.ranking);
  const me = game.players[sessionId] ?? null;

  const [viewedId, setViewedId] = useState(sessionId);
  const viewed = game.players[viewedId] ?? me;
  const own = !viewed || viewed.id === sessionId;
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [dragging, setDragging] = useState<{ defId: string; star: number } | null>(null);
  const [itemDrag, setItemDrag] = useState<{ index: number; id: string; x: number; y: number } | null>(null);
  const [backend, setBackend] = useState("");
  const [loading, setLoading] = useState<{ progress: number; done: boolean }>({ progress: 0, done: false });
  const [perf, setPerf] = useState("");
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);

  useEffect(() => {
    const scene = new BoardScene(hostRef.current!, {
      onMove: actions.move,
      onSell: actions.sell,
      onHover: setHover,
      onDrag: setDragging,
      onReady: setBackend,
      onLoading: (progress, done) => setLoading({ progress, done }),
    });
    sceneRef.current = scene;
    // Accès depuis la console en développement (débogage).
    if (import.meta.env.DEV) Object.assign(window, { __scene: scene });
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const phase = game.phase;
  const alive = me?.alive ?? false;
  const canEditBoard = own && alive && (phase === "planning" || phase === "armory");
  const canEditBench = own && alive && (phase === "planning" || phase === "armory" || phase === "combat");

  useEffect(() => {
    sceneRef.current?.setPlanning({ player: viewed, own, canEditBoard, canEditBench });
  }, [viewed, own, canEditBoard, canEditBench]);

  // Bannières de l'arène aux couleurs du panthéon favori (présage « Faveur du Panthéon »).
  const theme = game.omen === "favored_pantheon" ? game.omenDetail : null;
  useEffect(() => sceneRef.current?.setTheme(theme || null), [theme]);

  // Images par seconde et niveau de qualité (coin de l'écran).
  useEffect(() => {
    const id = setInterval(() => {
      const s = sceneRef.current;
      if (s) setPerf(`${s.backend} · ${s.qualityLevel} · ${Math.round(s.fps)} i/s`);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const opponent = battle?.report.opponentId ? (game.players[battle.report.opponentId] ?? null) : null;
  useEffect(() => {
    sceneRef.current?.setBattle(own ? battle : null, me, opponent);
  }, [battle, own, me, opponent]);

  // Raccourcis façon TFT : D actualise, F achète de l'XP, E vend l'unité survolée.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "d") actions.reroll();
      else if (k === "f") actions.buyXp();
      else if (k === "e") {
        const at = sceneRef.current?.hoveredLocation();
        if (at) actions.sell(at);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Glisser un objet du banc d'objets sur une unité.
  useEffect(() => {
    if (!itemDrag) return;
    const move = (e: PointerEvent) => setItemDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => {
      const at = sceneRef.current?.locationAt(e.clientX, e.clientY);
      if (at) actions.equip(itemDrag.index, at);
      setItemDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [itemDrag?.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const arrange = me && canEditBoard ? autoArrange(me) : null;
  const ended = phase === "ended" || ranking !== null;

  return (
    <div className="game">
      <div className="board-host" ref={hostRef} />
      <TopBar game={game} />
      <TraitsPanel player={viewed} />
      <PlayersPanel game={game} viewedId={viewed?.id ?? sessionId} onView={(id) => setViewedId(id)} />
      {!own && viewed && <ScoutPill name={viewed.name} onBack={() => setViewedId(sessionId)} />}
      {me && alive && (
        <ItemBench
          player={me}
          onItemDown={(index, e) => {
            e.preventDefault();
            setItemDrag({ index, id: me.items[index]!, x: e.clientX, y: e.clientY });
          }}
        />
      )}
      {me && alive && <ShopBar game={game} me={me} dragging={dragging} />}
      {arrange && (
        <button className="btn arrange-btn" onClick={() => actions.arrange(arrange)} title="Place les meilleures unités du banc sur les cases libres">
          Compléter le plateau
        </button>
      )}

      {phase === "omen" && <OmenVote game={game} me={me} />}
      {phase === "armory" && <Armory game={game} />}
      {me && alive && phase !== "ended" && <AugmentPicker me={me} />}
      <BattleBanner game={game} />
      {me && !me.alive && !ended && <Eliminated me={me} />}
      {ended && <GameOver game={game} />}

      <UnitTooltip info={itemDrag || dragging ? null : hover} />
      {itemDrag && (
        <div className="item-ghost" style={{ left: itemDrag.x, top: itemDrag.y }}>
          <ItemChip id={itemDrag.id} size={36} title={false} />
        </div>
      )}
      <Toasts />
      {backend && <div className="backend-badge">{perf || backend}</div>}
      {!loading.done && (
        <div className="loading-screen">
          <div className="loading-card">
            <h2>Mythic Chess</h2>
            <p>Les dieux descendent dans l'arène…</p>
            <div className="loading-bar">
              <i style={{ width: `${Math.round(loading.progress * 100)}%` }} />
            </div>
            <span className="muted small">{Math.round(loading.progress * 100)} %</span>
          </div>
        </div>
      )}
    </div>
  );
}
