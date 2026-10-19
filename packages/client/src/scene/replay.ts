// Lecteur du journal d'événements d'un combat : applique les événements au fil du temps et
// signale les effets visuels à la scène. Ne simule rien : tout vient du serveur.
import { mirrorHex, type BattleEvent, type DamageType, type Hex, type Team } from "@autochess/sim";
import type { BattleReport } from "../net/types";

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
  stunUntil: number;
  deadAt: number | null;
  /** Dernière attaque, pour l'élan vers la cible. */
  lunge: { at: number; target: number } | null;
  castAt: number;
}

/** Effets visuels demandés à la scène. */
export interface ReplayFx {
  attack(unit: ReplayUnit, target: ReplayUnit): void;
  damage(target: ReplayUnit, amount: number, type: DamageType, crit: boolean): void;
  heal(target: ReplayUnit, amount: number): void;
  shield(target: ReplayUnit, amount: number): void;
  stun(target: ReplayUnit): void;
  cast(unit: ReplayUnit, ability: string): void;
  death(unit: ReplayUnit): void;
}

export class Replay {
  readonly units = new Map<number, ReplayUnit>();
  readonly mySide: Team;
  readonly endT: number;
  winner: Team | null = null;
  ended = false;
  private index = 0;
  private readonly events: readonly BattleEvent[];
  private readonly flip: boolean;
  private readonly lastCrit = new Map<number, number>();

  constructor(report: BattleReport) {
    this.events = report.events;
    this.mySide = report.side;
    // Le joueur de l'équipe 1 est en haut dans le journal : on retourne la vue.
    this.flip = report.side === 1;
    this.endT = report.events.at(-1)?.t ?? 0;
  }

  private display(hex: Hex): Hex {
    return this.flip ? mirrorHex(hex) : hex;
  }

  shieldOf(u: ReplayUnit, t: number): number {
    return u.shields.reduce((sum, s) => sum + (s.until > t ? s.amount : 0), 0);
  }

  /** Applique tous les événements jusqu'au temps `t` (ms). `fx` = null : sans effets (rattrapage). */
  advance(t: number, fx: ReplayFx): void {
    while (this.index < this.events.length && this.events[this.index]!.t <= t) {
      const ev = this.events[this.index++]!;
      // Onglet en arrière-plan : on rattrape sans afficher les effets trop anciens.
      this.apply(ev, t - ev.t < 400 ? fx : null);
    }
  }

  private apply(ev: BattleEvent, fx: ReplayFx | null): void {
    const unit = (id: number) => this.units.get(id);
    switch (ev.type) {
      case "spawn":
        this.units.set(ev.unit, {
          id: ev.unit,
          team: ev.team,
          defId: ev.defId,
          star: ev.star,
          hex: this.display(ev.hex),
          spawnHex: this.display(ev.hex),
          move: null,
          hp: ev.maxHp,
          maxHp: ev.maxHp,
          mana: ev.mana,
          maxMana: ev.maxMana,
          shields: [],
          stunUntil: 0,
          deadAt: null,
          lunge: null,
          castAt: -1e9,
        });
        break;
      case "move": {
        const u = unit(ev.unit);
        if (!u) break;
        u.move = { from: this.display(ev.from), to: this.display(ev.to), start: ev.t, dur: ev.durationMs };
        u.hex = this.display(ev.to);
        break;
      }
      case "attack": {
        const u = unit(ev.unit);
        const target = unit(ev.target);
        if (!u || !target) break;
        u.mana = ev.mana;
        u.lunge = { at: ev.t, target: ev.target };
        if (ev.crit) this.lastCrit.set(ev.unit, ev.t);
        fx?.attack(u, target);
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
        const crit = this.lastCrit.get(ev.source) === ev.t;
        fx?.damage(target, ev.amount + ev.shieldAbsorbed, ev.damageType, crit);
        break;
      }
      case "cast": {
        const u = unit(ev.unit);
        if (!u) break;
        u.castAt = ev.t;
        u.mana = 0;
        fx?.cast(u, ev.ability);
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
        target.shields.push({ amount: ev.amount, until: ev.t + ev.durationMs });
        fx?.shield(target, ev.amount);
        break;
      }
      case "stun": {
        const target = unit(ev.target);
        if (!target) break;
        target.stunUntil = Math.max(target.stunUntil, ev.t + ev.durationMs);
        fx?.stun(target);
        break;
      }
      case "buff": {
        const target = unit(ev.target);
        if (target && ev.stat === "maxHp" && ev.durationMs === undefined) {
          target.maxHp += ev.amount;
          target.hp += ev.amount;
        }
        break;
      }
      case "death": {
        const u = unit(ev.unit);
        if (!u) break;
        u.deadAt = ev.t;
        u.hp = 0;
        fx?.death(u);
        break;
      }
      case "end":
        this.winner = ev.winner;
        this.ended = true;
        break;
      case "traits":
        break;
    }
  }
}
