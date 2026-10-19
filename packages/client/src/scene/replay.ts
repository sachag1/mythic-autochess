// Lecteur du journal d'événements d'un combat : applique les événements dans l'ordre de la
// timeline de présentation (impacts décalés, voir timeline.ts) et signale les effets
// visuels à la scène. Ne simule rien : tout vient du serveur.
//
// Extensible : un type d'événement inconnu qui vise une unité (`target`) avec une durée
// (`durationMs`) devient un statut (brûlure, anti-soin…) affiché d'après status.ts ; tout
// autre type inconnu passe par `fx.other` sans erreur.
import { mirrorHex, type BattleEvent, type DamageType, type Hex, type Team } from "@autochess/sim";
import type { BattleReport } from "../net/types";
import { buildTimeline, type CastGroup, type Presented } from "./timeline";

export interface ReplayUnit {
  id: number;
  team: Team;
  defId: string;
  star: number;
  /** Case actuelle, en coordonnées d'affichage (joueur en bas). */
  hex: Hex;
  /** Case de départ (coordonnées d'affichage). */
  spawnHex: Hex;
  move: { from: Hex; to: Hex; start: number; dur: number } | null;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  shields: { amount: number; until: number }[];
  /** Statuts actifs (« stun », « burn »…) → fin (ms). */
  statuses: Map<string, number>;
  /** Source du dernier étourdissement (style pierre, glace…). */
  stunSource: number | null;
  deadAt: number | null;
  lastTarget: number | null;
}

/** Effets visuels demandés à la scène. */
export interface ReplayFx {
  spawn(unit: ReplayUnit): void;
  move(unit: ReplayUnit, durationMs: number): void;
  attack(unit: ReplayUnit, target: ReplayUnit, crit: boolean, impactInMs: number): void;
  cast(unit: ReplayUnit, group: CastGroup, impactInMs: number): void;
  damage(target: ReplayUnit, amount: number, type: DamageType | string, crit: boolean, source: ReplayUnit | undefined): void;
  heal(target: ReplayUnit, amount: number): void;
  shield(target: ReplayUnit, amount: number, durationMs: number): void;
  status(target: ReplayUnit, type: string, durationMs: number, source: ReplayUnit | undefined): void;
  buff(target: ReplayUnit, stat: string, amount: number): void;
  death(unit: ReplayUnit): void;
  end(winner: Team | null): void;
  other(ev: BattleEvent): void;
}

export class Replay {
  readonly units = new Map<number, ReplayUnit>();
  readonly mySide: Team;
  readonly endT: number;
  winner: Team | null = null;
  ended = false;
  private index = 0;
  private readonly timeline: Presented[];
  private readonly flip: boolean;
  private readonly crits = new Map<string, boolean>();

  constructor(report: BattleReport) {
    this.timeline = buildTimeline(report.events);
    this.mySide = report.side;
    // Le joueur de l'équipe 1 est en haut dans le journal : on retourne la vue.
    this.flip = report.side === 1;
    this.endT = this.timeline.at(-1)?.at ?? 0;
  }

  private display(hex: Hex): Hex {
    return this.flip ? mirrorHex(hex) : hex;
  }

  shieldOf(u: ReplayUnit, t: number): number {
    return u.shields.reduce((sum, s) => sum + (s.until > t ? s.amount : 0), 0);
  }

  hasStatus(u: ReplayUnit, type: string, t: number): boolean {
    return (u.statuses.get(type) ?? 0) > t;
  }

  /** Applique tous les événements jusqu'au temps `t` (ms). */
  advance(t: number, fx: ReplayFx): void {
    while (this.index < this.timeline.length && this.timeline[this.index]!.at <= t) {
      const p = this.timeline[this.index++]!;
      // Onglet en arrière-plan : on rattrape l'état sans rejouer les effets trop anciens.
      this.apply(p, t - p.at < 500 ? fx : null, t);
    }
  }

  private apply(p: Presented, fx: ReplayFx | null, now: number): void {
    const ev = p.ev;
    const unit = (id: number) => this.units.get(id);
    switch (ev.type) {
      case "spawn": {
        const u: ReplayUnit = {
          id: ev.unit, team: ev.team, defId: ev.defId, star: ev.star,
          hex: this.display(ev.hex), spawnHex: this.display(ev.hex), move: null,
          hp: ev.maxHp, maxHp: ev.maxHp, mana: ev.mana, maxMana: ev.maxMana,
          shields: [], statuses: new Map(), stunSource: null, deadAt: null, lastTarget: null,
        };
        this.units.set(ev.unit, u);
        fx?.spawn(u);
        break;
      }
      case "move": {
        const u = unit(ev.unit);
        if (!u) break;
        u.move = { from: this.display(ev.from), to: this.display(ev.to), start: p.at, dur: ev.durationMs };
        u.hex = this.display(ev.to);
        fx?.move(u, ev.durationMs);
        break;
      }
      case "attack": {
        const u = unit(ev.unit);
        const target = unit(ev.target);
        if (!u || !target) break;
        u.mana = ev.mana;
        u.lastTarget = ev.target;
        this.crits.set(`${ev.unit}@${ev.t}`, ev.crit);
        fx?.attack(u, target, ev.crit, (p.impactAt ?? p.at) - now);
        break;
      }
      case "damage": {
        const target = unit(ev.target);
        if (!target) break;
        target.hp = ev.hp;
        target.mana = ev.mana;
        let absorbed = ev.shieldAbsorbed;
        for (const s of target.shields) {
          const take = Math.min(s.amount, absorbed);
          s.amount -= take;
          absorbed -= take;
        }
        fx?.damage(target, ev.amount + ev.shieldAbsorbed, ev.damageType, this.crits.get(`${ev.source}@${ev.t}`) ?? false, unit(ev.source));
        break;
      }
      case "cast": {
        const u = unit(ev.unit);
        if (!u || !p.cast) break;
        u.mana = 0;
        u.lastTarget = ev.target;
        fx?.cast(u, p.cast, p.cast.impactAt - now);
        break;
      }
      case "heal": {
        const target = unit(ev.target);
        if (!target) break;
        target.hp = ev.hp;
        target.maxHp = Math.max(target.maxHp, ev.hp);
        if (ev.amount >= 1) fx?.heal(target, ev.amount);
        break;
      }
      case "shield": {
        const target = unit(ev.target);
        if (!target) break;
        target.shields.push({ amount: ev.amount, until: p.at + ev.durationMs });
        fx?.shield(target, ev.amount, ev.durationMs);
        break;
      }
      case "stun": {
        const target = unit(ev.target);
        if (!target) break;
        target.statuses.set("stun", Math.max(target.statuses.get("stun") ?? 0, p.at + ev.durationMs));
        target.stunSource = ev.source;
        fx?.status(target, "stun", ev.durationMs, unit(ev.source));
        break;
      }
      case "buff": {
        const target = unit(ev.target);
        if (!target) break;
        if (ev.stat === "maxHp" && ev.durationMs === undefined) {
          target.maxHp += ev.amount;
          target.hp += ev.amount;
        }
        fx?.buff(target, ev.stat, ev.amount);
        break;
      }
      case "death": {
        const u = unit(ev.unit);
        if (!u) break;
        u.deadAt = p.at;
        u.hp = 0;
        u.statuses.clear();
        fx?.death(u);
        break;
      }
      case "end":
        this.winner = ev.winner;
        this.ended = true;
        fx?.end(ev.winner);
        break;
      case "traits":
        break;
      default: {
        // Événement ajouté plus tard à la simulation (brûlure, anti-soin…).
        const e = ev as { type: string; target?: number; durationMs?: number; source?: number };
        const target = typeof e.target === "number" ? unit(e.target) : undefined;
        if (target && typeof e.durationMs === "number") {
          target.statuses.set(e.type, Math.max(target.statuses.get(e.type) ?? 0, p.at + e.durationMs));
          fx?.status(target, e.type, e.durationMs, typeof e.source === "number" ? unit(e.source) : undefined);
        } else fx?.other(ev);
      }
    }
  }
}
