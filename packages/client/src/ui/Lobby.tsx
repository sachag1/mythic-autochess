import { useState } from "react";
import { actions, connect, leave, useStore } from "../net/store";
import { Timer } from "./common";

const NAME_KEY = "autochess.name";

/** Écran d'accueil : pseudo, puis rejoindre une partie ouverte ou en créer une. */
export function Lobby() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.connectError);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? "");
  const [code, setCode] = useState("");
  const busy = status === "connecting";

  const go = (mode: "join" | "create" | "code") => {
    const n = name.trim().slice(0, 20);
    localStorage.setItem(NAME_KEY, n);
    void connect(mode, n, code);
  };

  return (
    <div className="screen lobby">
      <div className="lobby-card">
        <h1>
          Mythic <span>Chess</span>
        </h1>
        <p className="tagline">Auto chess des huit panthéons</p>
        <label className="field">
          <span>Pseudo</span>
          <input
            autoFocus
            maxLength={20}
            value={name}
            placeholder="Héros sans nom"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && go("join")}
          />
        </label>
        <div className="lobby-actions">
          <button className="btn primary" disabled={busy} onClick={() => go("join")}>
            Rejoindre une partie
          </button>
          <button className="btn" disabled={busy} onClick={() => go("create")}>
            Créer une partie
          </button>
        </div>
        <div className="code-row">
          <input value={code} placeholder="Code de la partie" onChange={(e) => setCode(e.target.value)} />
          <button className="btn small" disabled={busy || !code.trim()} onClick={() => go("code")}>
            Rejoindre
          </button>
        </div>
        {busy && <p className="muted">Connexion…</p>}
        {error && <p className="error-text">{error}</p>}
        <p className="muted small">Les places libres sont prises par des bots au lancement.</p>
      </div>
    </div>
  );
}

/** Salon d'attente avant le début de la partie. */
export function WaitingRoom() {
  const game = useStore((s) => s.game)!;
  const sessionId = useStore((s) => s.sessionId);
  const roomId = useStore((s) => s.roomId);
  const players = Object.values(game.players);
  const isHost = game.hostId === sessionId;

  return (
    <div className="screen lobby">
      <div className="lobby-card">
        <h2>Salon</h2>
        <p className="muted">
          Code : <code className="room-code">{roomId}</code>
        </p>
        <ul className="lobby-players">
          {players.map((p) => (
            <li key={p.id} className={p.id === sessionId ? "me" : ""}>
              {p.id === game.hostId && <span title="Hôte">👑 </span>}
              {p.name}
            </li>
          ))}
          {Array.from({ length: Math.max(0, 8 - players.length) }, (_, i) => (
            <li key={`bot${i}`} className="empty">
              Bot
            </li>
          ))}
        </ul>
        <p className="muted small">
          Démarrage automatique dans <Timer endsAt={game.phaseEndsAt} />
        </p>
        <div className="lobby-actions">
          {isHost ? (
            <button className="btn primary" onClick={actions.start}>
              Commencer
            </button>
          ) : (
            <p className="muted">En attente de l'hôte…</p>
          )}
          <button className="btn" onClick={() => void leave()}>
            Quitter
          </button>
        </div>
      </div>
    </div>
  );
}
