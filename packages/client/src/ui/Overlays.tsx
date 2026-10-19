import { useEffect, useState } from "react";
import { augmentDef, COST_COLORS, itemDef, omenDef, TIER_LABELS, unitColor, unitDef } from "../data/content";
import { actions, leave, useStore } from "../net/store";
import type { GameSnap, PlayerSnap } from "../net/types";
import type { HoverInfo } from "../scene/BoardScene";
import { ItemChip, Timer, TraitTag, UnitPortrait } from "./common";
import { UnitTooltipBody } from "./Hud";
import { ordinal } from "./text";

// ---------------------------------------------------------------- présage

export function OmenVote({ game, me }: { game: GameSnap; me: PlayerSnap | null }) {
  const voters = Object.values(game.players);
  return (
    <div className="overlay center">
      <div className="overlay-title">
        <h2>Les dieux ont parlé</h2>
        <p>
          Votez pour le présage de cette partie — tirage pondéré par les votes · <Timer endsAt={game.phaseEndsAt} />
        </p>
      </div>
      <div className="omen-cards">
        {game.omenChoices.map((id) => {
          const omen = omenDef(id);
          if (!omen) return null;
          const herald = unitDef(omen.herald);
          const votes = voters.filter((p) => p.omenVote === id).length;
          const mine = me?.omenVote === id;
          return (
            <button key={id} className={`omen-card ${mine ? "chosen" : ""}`} onClick={() => actions.vote(id)}>
              <div className="herald" style={{ background: `radial-gradient(circle at 50% 35%, ${unitColor(herald)}, transparent 70%)` }}>
                <UnitPortrait defId={omen.herald} size={64} />
                <span>Annoncé par {herald?.name ?? omen.herald}</span>
              </div>
              <h3>{omen.name}</h3>
              <p>{omen.description}</p>
              <div className="votes">
                {votes} vote{votes > 1 ? "s" : ""}
                {mine && <b> · votre choix</b>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- armurerie

export function Armory({ game }: { game: GameSnap }) {
  const sessionId = useStore((s) => s.sessionId);
  const myTurn = game.armoryPicker === sessionId;
  const picker = game.players[game.armoryPicker];
  const alreadyPicked = game.armory.some((o) => o.takenBy === sessionId);
  return (
    <div className="overlay armory">
      <div className="overlay-title">
        <h2>Armurerie</h2>
        <p className={myTurn ? "your-turn" : ""}>
          {myTurn ? "À vous de choisir !" : alreadyPicked ? "Vous avez choisi. " : ""}
          {!myTurn && picker && <>Au tour de {picker.name} </>}· <Timer endsAt={game.phaseEndsAt} />
        </p>
        <p className="muted small">Le joueur le plus bas en PV choisit en premier.</p>
      </div>
      <div className="armory-offers">
        {game.armory.map((offer, i) => {
          const def = unitDef(offer.defId);
          const item = itemDef(offer.item);
          const taker = offer.takenBy ? game.players[offer.takenBy] : null;
          return (
            <button
              key={i}
              className={`armory-offer ${taker ? "taken" : ""} ${myTurn && !taker ? "pickable" : ""}`}
              disabled={!myTurn || Boolean(taker)}
              onClick={() => actions.pick(i)}
              style={{ borderColor: COST_COLORS[def?.cost ?? 1] }}
            >
              <UnitPortrait defId={offer.defId} size={46} />
              <div className="offer-info">
                <b>{def?.name}</b>
                <div className="offer-traits">{def?.traits.map((t) => <TraitTag key={t} id={t} />)}</div>
                <div className="offer-item">
                  <ItemChip id={offer.item} size={22} /> {item?.name}
                </div>
              </div>
              {taker && <span className="taken-by">{taker.id === sessionId ? "Vous" : taker.name}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- augments

export function AugmentPicker({ me }: { me: PlayerSnap }) {
  const [hidden, setHidden] = useState(false);
  const choices = me.augmentChoices ?? [];
  const key = choices.join(",");
  useEffect(() => setHidden(false), [key]);
  if (!choices.length) return null;
  if (hidden)
    return (
      <button className="btn augment-reopen" onClick={() => setHidden(false)}>
        ✦ Choisir un augment
      </button>
    );
  const tier = augmentDef(choices[0]!)?.tier ?? "silver";
  return (
    <div className="overlay center augment-overlay">
      <div className="overlay-title">
        <h2>Augment {TIER_LABELS[tier].toLowerCase()}</h2>
        <p className="muted">Choisissez avant la fin de la préparation, sinon un augment est pris au hasard.</p>
      </div>
      <div className="augment-cards">
        {choices.map((id, i) => {
          const a = augmentDef(id);
          return (
            <button key={id} className={`augment-card ${a?.tier ?? tier}`} onClick={() => actions.chooseAugment(i)}>
              <span className="tier">{TIER_LABELS[a?.tier ?? tier]}</span>
              <h3>{a?.name ?? id}</h3>
              <p>{a?.description}</p>
            </button>
          );
        })}
      </div>
      <div className="augment-actions">
        <button className="btn" disabled={(me.augmentRerolls ?? 0) <= 0} onClick={actions.rerollAugments}>
          Relancer ({me.augmentRerolls ?? 0})
        </button>
        <button className="btn ghost" onClick={() => setHidden(true)}>
          Voir le plateau
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- combat

export function BattleBanner({ game }: { game: GameSnap }) {
  const battle = useStore((s) => s.battle);
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, []);
  if (!battle || game.phase !== "combat") return null;
  const { report, startedAt } = battle;
  const opponent = report.opponentId ? game.players[report.opponentId] : null;
  const endT = report.events.at(-1)?.t ?? 0;
  const done = now - startedAt >= endT;
  const outcome = report.winner === null ? "draw" : report.winner === report.side ? "win" : "loss";
  return (
    <>
      <div className="battle-vs">
        {opponent ? (
          <>
            Contre <b>{opponent.name}</b>
            {report.ghost && <small> (copie)</small>}
          </>
        ) : (
          <>Créatures</>
        )}
      </div>
      {done && <div className={`battle-result ${outcome}`}>{outcome === "win" ? "Victoire !" : outcome === "loss" ? "Défaite" : "Égalité"}</div>}
    </>
  );
}

// ---------------------------------------------------------------- fin de partie

export function GameOver({ game }: { game: GameSnap }) {
  const ranking = useStore((s) => s.ranking);
  const sessionId = useStore((s) => s.sessionId);
  const rows = ranking ?? Object.values(game.players).map((p) => ({ id: p.id, name: p.name, placement: p.placement || 1 }));
  const sorted = [...rows].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99));
  const mine = sorted.find((r) => r.id === sessionId);
  return (
    <div className="overlay center dim">
      <div className="end-card">
        <h2>{mine?.placement === 1 ? "Victoire !" : "Partie terminée"}</h2>
        {mine && <p className="placement">Vous finissez {ordinal(mine.placement ?? 0)}</p>}
        <ol className="ranking">
          {sorted.map((r) => (
            <li key={r.id} className={r.id === sessionId ? "me" : ""}>
              <span className="rank">{r.placement}</span> {r.name}
              <span className="augs">
                {(game.players[r.id]?.augments ?? []).map((id) => (
                  <span key={id} className={`augment-pip ${augmentDef(id)?.tier ?? ""}`} title={augmentDef(id)?.name}>
                    {augmentDef(id)?.name.slice(0, 1)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
        <button className="btn primary" onClick={() => void leave()}>
          Retour à l'accueil
        </button>
      </div>
    </div>
  );
}

export function Eliminated({ me }: { me: PlayerSnap }) {
  const [watching, setWatching] = useState(false);
  if (watching) return null;
  return (
    <div className="overlay center dim">
      <div className="end-card">
        <h2>Éliminé</h2>
        <p className="placement">Vous finissez {ordinal(me.placement)}</p>
        <div className="lobby-actions">
          <button className="btn" onClick={() => setWatching(true)}>
            Regarder la suite
          </button>
          <button className="btn primary" onClick={() => void leave()}>
            Quitter
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- divers

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function UnitTooltip({ info }: { info: HoverInfo | null }) {
  if (!info) return null;
  const left = Math.min(info.x + 18, window.innerWidth - 300);
  const top = Math.min(info.y + 18, window.innerHeight - 200);
  return (
    <div className={`tooltip ${info.enemy ? "enemy" : ""}`} style={{ left, top }}>
      <UnitTooltipBody defId={info.defId} star={info.star} items={info.items} />
      {info.hp !== undefined && (
        <div className="tt-stats">
          ❤ {info.hp} / {info.maxHp} · ✦ {info.mana} / {info.maxMana}
        </div>
      )}
    </div>
  );
}

/** Rappel pour l'observation d'un autre plateau. */
export function ScoutPill({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <button className="scout-pill" onClick={onBack}>
      👁 Plateau de {name} — revenir au vôtre
    </button>
  );
}
