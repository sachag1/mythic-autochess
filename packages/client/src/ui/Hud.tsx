import { countTraits, type UnitDef } from "@autochess/sim";
import { useState } from "react";
import { augmentDef, COST_COLORS, omenDef, sellValue, traitDef, unitColor, unitDef } from "../data/content";
import { actions, useStore } from "../net/store";
import type { GameSnap, PlayerSnap, UnitSnap } from "../net/types";
import { ItemChip, portraitUrl, Stars, Timer, TraitTag, UnitPortrait } from "./common";
import { PHASE_LABELS, roundKindLabel } from "./text";

// ---------------------------------------------------------------- barre du haut

export function TopBar({ game }: { game: GameSnap }) {
  const omen = omenDef(game.omen);
  const detail = game.omenDetail ? traitDef(game.omenDetail)?.name : null;
  return (
    <div className="top-bar">
      <div className="stage">
        <b>
          {game.stage}-{game.round}
        </b>
        <span>{roundKindLabel(game.stage, game.round)}</span>
      </div>
      <div className="phase">
        <span>{PHASE_LABELS[game.phase] ?? game.phase}</span>
        {game.phase !== "ended" && <Timer endsAt={game.phaseEndsAt} />}
      </div>
      {omen && (
        <div className="omen-badge" title={`${omen.description}${detail ? ` (${detail})` : ""}`}>
          ✦ {omen.name}
          {detail && <em> · {detail}</em>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- joueurs

export function PlayersPanel({ game, viewedId, onView }: { game: GameSnap; viewedId: string; onView: (id: string) => void }) {
  const sessionId = useStore((s) => s.sessionId);
  const players = Object.values(game.players).sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || b.hp - a.hp || a.placement - b.placement);
  return (
    <div className="players-panel">
      {players.map((p) => (
        <button
          key={p.id}
          className={`player-row ${p.id === sessionId ? "me" : ""} ${p.alive ? "" : "dead"} ${p.id === viewedId ? "viewed" : ""}`}
          onClick={() => onView(p.id)}
          title={p.id === sessionId ? "Votre plateau" : `Observer le plateau de ${p.name}`}
        >
          <div className="player-head">
            <span className="player-name">
              {p.name}
              {p.isBot && <small> · bot</small>}
              {!p.isBot && !p.connected && p.id !== sessionId && <small> · absent</small>}
            </span>
            <span className="player-level">niv. {p.level}</span>
          </div>
          <div className="hp-line">
            <div className="player-hp">
              <i style={{ width: `${Math.max(0, p.hp)}%` }} />
            </div>
            <span className="hp-num">{p.alive ? p.hp : `${p.placement}e`}</span>
          </div>
          {p.augments.length > 0 && (
            <div className="augment-pips">
              {p.augments.map((id) => {
                const a = augmentDef(id);
                return (
                  <span key={id} className={`augment-pip ${a?.tier ?? ""}`} title={a ? `${a.name} — ${a.description}` : id}>
                    {a?.name.slice(0, 1)}
                  </span>
                );
              })}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- synergies

export function TraitsPanel({ player }: { player: PlayerSnap | null }) {
  if (!player) return null;
  const defs = Object.values(player.board)
    .map((u) => unitDef(u.defId))
    .filter((d): d is UnitDef => Boolean(d));
  const counts = [...countTraits(defs)];
  const rows = counts
    .map(([id, count]) => {
      const t = traitDef(id);
      const reached = t ? t.breakpoints.filter((b) => count >= b.count).length : 0;
      return { id, count, t, reached };
    })
    .filter((r) => r.t)
    .sort((a, b) => b.reached - a.reached || b.count - a.count || a.id.localeCompare(b.id));
  if (!rows.length) return <div className="traits-panel empty muted small">Placez des unités pour activer des synergies</div>;
  return (
    <div className="traits-panel">
      {rows.map(({ id, count, t, reached }) => (
        <div key={id} className={`trait-row tier-${reached} ${t!.kind}`} title={t!.description}>
          <span className="trait-count">{count}</span>
          <div className="trait-info">
            <span className="trait-name">{t!.name}</span>
            <span className="trait-steps">
              {t!.breakpoints.map((b, i) => (
                <b key={b.count} className={i < reached ? "on" : ""}>
                  {b.count}
                </b>
              ))}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- objets

export function ItemBench({ player, onItemDown }: { player: PlayerSnap; onItemDown: (index: number, e: React.PointerEvent) => void }) {
  return (
    <div className="item-bench">
      {Array.from({ length: 10 }, (_, i) => {
        const id = player.items[i];
        return (
          <div key={i} className="item-slot">
            {id && (
              <div className="item-drag" onPointerDown={(e) => onItemDown(i, e)}>
                <ItemChip id={id} size={34} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- boutique

export function ShopBar({ game, me, dragging }: { game: GameSnap; me: PlayerSnap; dragging: { defId: string; star: number } | null }) {
  const shop = me.shop ?? [];
  const owned = new Map<string, number>();
  for (const u of [...Object.values(me.bench), ...Object.values(me.board)]) {
    if (u.star === 1) owned.set(u.defId, (owned.get(u.defId) ?? 0) + 1);
  }
  const xpCost = game.omen === "odin_wisdom" ? 3 : 4;
  const free = me.freeRerolls ?? 0;
  const boardCount = Object.keys(me.board).length;
  const xpPct = me.xpToNext > 0 ? (me.xp / me.xpToNext) * 100 : 100;

  return (
    <div className={`shop-bar ${dragging ? "selling" : ""}`} data-sell-zone>
      {dragging && (
        <div className="sell-overlay">
          Vendre pour <b>{sellValue(dragging.defId, dragging.star)} or</b>
        </div>
      )}
      <div className="shop-side">
        <div className="level-line">
          <span className="level">Niveau {me.level}</span>
          <span className={`board-count ${boardCount < me.level ? "free" : ""}`} title="Unités sur le plateau / maximum">
            {boardCount}/{me.level}
          </span>
        </div>
        <div className="xp-bar" title={me.xpToNext ? `${me.xp} / ${me.xpToNext} XP` : "Niveau maximum"}>
          <i style={{ width: `${xpPct}%` }} />
          <span>{me.xpToNext ? `${me.xp}/${me.xpToNext}` : "max"}</span>
        </div>
        <button className="btn shop-btn" onClick={actions.buyXp} disabled={me.gold < xpCost || !me.xpToNext} title="Raccourci : F">
          Acheter XP <span className="gold">{xpCost}</span>
        </button>
        <button className="btn shop-btn" onClick={actions.reroll} disabled={free === 0 && me.gold < 2} title="Raccourci : D">
          Actualiser {free > 0 ? <span className="free">gratuit</span> : <span className="gold">2</span>}
        </button>
      </div>
      <div className="shop-cards">
        {shop.map((defId, i) => (
          <ShopCard key={i} defId={defId} copies={owned.get(defId) ?? 0} affordable={me.gold >= (unitDef(defId)?.cost ?? 99)} onBuy={() => actions.buy(i)} />
        ))}
      </div>
      <div className="shop-side right">
        <div className="gold-big" title="Or">
          <span className="coin" /> {me.gold}
        </div>
        <div className="stat-line">
          <span title="Points de vie">❤ {me.hp}</span>
          <span title={me.streak >= 0 ? "Série de victoires" : "Série de défaites"} className={me.streak > 0 ? "win" : me.streak < 0 ? "loss" : ""}>
            {me.streak > 0 ? `🔥 ${me.streak}` : me.streak < 0 ? `❄ ${-me.streak}` : "—"}
          </span>
        </div>
        <button className={`btn lock-btn ${me.shopLocked ? "locked" : ""}`} onClick={actions.lock} title="Verrouiller la boutique pour le prochain round">
          {me.shopLocked ? "🔒 Verrouillée" : "🔓 Verrouiller"}
        </button>
      </div>
    </div>
  );
}

function ShopCard({ defId, copies, affordable, onBuy }: { defId: string; copies: number; affordable: boolean; onBuy: () => void }) {
  const def = unitDef(defId);
  const [bought, setBought] = useState(false);
  if (!def) return <div className="shop-card empty" />;
  const color = COST_COLORS[def.cost];
  return (
    <button
      className={`shop-card cost-${def.cost} ${affordable ? "" : "poor"} ${copies >= 2 ? "upgrade" : copies === 1 ? "owned" : ""} ${bought ? "bought" : ""}`}
      style={{ "--cost": color, "--pantheon": unitColor(def) } as React.CSSProperties}
      onClick={() => {
        if (affordable) setBought(true);
        onBuy();
      }}
      onAnimationEnd={() => setBought(false)}
      title={`${def.ability.name} — ${def.ability.description}`}
    >
      <img className="card-art" src={portraitUrl(defId)} alt="" draggable={false} onError={(e) => (e.currentTarget.style.display = "none")} />
      <div className="card-traits">
        {def.traits.map((t) => (
          <TraitTag key={t} id={t} />
        ))}
      </div>
      <div className="card-bottom">
        <span className="card-name">{def.name}</span>
        <span className="card-cost">
          <span className="coin small" /> {def.cost}
        </span>
      </div>
      {copies > 0 && <span className="copies">{copies >= 2 ? "★★" : `×${copies}`}</span>}
    </button>
  );
}

// ---------------------------------------------------------------- placement automatique

/** Complète le plateau avec les meilleures unités du banc (message `arrange`). */
export function autoArrange(me: PlayerSnap): { uid: string; col: number; row: number }[] | null {
  const free = me.level - Object.keys(me.board).length;
  const bench = Object.values(me.bench);
  if (free <= 0 || !bench.length) return null;
  const layout = Object.entries(me.board).map(([key, u]) => {
    const [col, row] = key.split(",").map(Number) as [number, number];
    return { uid: u.uid, col, row };
  });
  const taken = new Set(layout.map((l) => `${l.col},${l.row}`));
  const score = (u: UnitSnap) => (unitDef(u.defId)?.cost ?? 0) * 3 ** (u.star - 1);
  const picks = [...bench].sort((a, b) => score(b) - score(a)).slice(0, free);
  for (const u of picks) {
    const range = unitDef(u.defId)?.stats.range ?? 1;
    // Corps à corps devant (rangée 3, la plus proche de l'ennemi), distance derrière.
    const rows = range <= 1 ? [3, 2, 1, 0] : range >= 4 ? [0, 1, 2, 3] : [1, 0, 2, 3];
    const cols = [3, 2, 4, 1, 5, 0, 6];
    outer: for (const row of rows) {
      for (const col of cols) {
        const key = `${col},${row}`;
        if (taken.has(key)) continue;
        taken.add(key);
        layout.push({ uid: u.uid, col, row });
        break outer;
      }
    }
  }
  return layout;
}

export function UnitTooltipBody({ defId, star, items }: { defId: string; star: number; items: string[] }) {
  const def = unitDef(defId);
  if (!def) return null;
  return (
    <>
      <div className="tt-head">
        <UnitPortrait defId={defId} size={32} />
        <div>
          <b>{def.name}</b> <Stars star={star} />
          <div className="tt-traits">
            {def.traits.map((t) => (
              <TraitTag key={t} id={t} />
            ))}
            {def.traits.length === 0 && <span className="muted small">Monstre</span>}
          </div>
        </div>
        {def.traits.length > 0 && (
          <span className="tt-cost" style={{ color: COST_COLORS[def.cost] }}>
            {def.cost} or
          </span>
        )}
      </div>
      <div className="tt-ability">
        <b>{def.ability.name}</b> — {def.ability.description}
      </div>
      {items.length > 0 && (
        <div className="tt-items">
          {items.map((id, i) => (
            <ItemChip key={i} id={id} size={22} />
          ))}
        </div>
      )}
    </>
  );
}
