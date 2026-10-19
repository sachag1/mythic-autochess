// Timeline de présentation d'un combat. La simulation applique une attaque ou un sort et
// leurs effets au même instant ; pour l'œil, l'impact doit tomber quand l'arme touche ou
// quand le projectile arrive. On décale donc les effets d'une attaque ou d'un sort (dégâts,
// soins, boucliers, étourdissements…) d'un délai d'impact, et les morts après le dernier
// coup reçu. Rien n'est recalculé : seuls les instants d'affichage changent.
import type { BattleEvent } from "@autochess/sim";
import { unitDef } from "../data/content";
import { specFor } from "./characters/catalog";
import { spellImpactMs } from "./vfx/spells";

/** Délai entre le début de l'animation d'attaque et le coup (ms), voir Character.ATTACK_IMPACT. */
export const MELEE_IMPACT_MS = 280;
/** Durée de vol des projectiles d'attaque (ms). */
export const PROJECTILE_MS = 260;

export interface CastGroup {
  caster: number;
  center: number;
  ability: string;
  /** Effets du sort (mêmes source et instant que le lancement). */
  effects: BattleEvent[];
  /** Instant d'affichage des effets (ms). */
  impactAt: number;
}

export interface Presented {
  /** Instant d'affichage (ms depuis le début du combat). */
  at: number;
  ev: BattleEvent;
  /** Pour un événement « cast » : le sort et ses effets. */
  cast?: CastGroup;
  /** Pour une attaque : instant d'impact. */
  impactAt?: number;
}

/** Source d'un événement d'effet (dégâts, soin…), ou null. */
function sourceOf(ev: BattleEvent): number | null {
  const s = (ev as { source?: unknown }).source;
  return typeof s === "number" ? s : null;
}
function targetOf(ev: BattleEvent): number | null {
  const t = (ev as { target?: unknown }).target;
  return typeof t === "number" ? t : null;
}

export function attackImpactMs(defId: string): number {
  const style = specFor(defId).attack;
  const ranged = (unitDef(defId)?.stats.range ?? 1) > 1;
  return ranged || style === "bow" || style === "crossbow" || style === "magic" || style === "thrown" ? MELEE_IMPACT_MS + PROJECTILE_MS : MELEE_IMPACT_MS;
}

export function buildTimeline(events: readonly BattleEvent[]): Presented[] {
  const defIds = new Map<number, string>();
  for (const ev of events) if (ev.type === "spawn") defIds.set(ev.unit, ev.defId);

  const out: Presented[] = [];
  /** Délai à appliquer aux effets d'une source à un instant donné. */
  const pending = new Map<string, { impactAt: number; cast?: CastGroup }>();
  const key = (unit: number, t: number) => `${unit}@${t}`;
  const lastHitAt = new Map<number, number>();

  for (const ev of events) {
    switch (ev.type) {
      case "attack": {
        const impactAt = ev.t + attackImpactMs(defIds.get(ev.unit) ?? "");
        pending.set(key(ev.unit, ev.t), { impactAt });
        out.push({ at: ev.t, ev, impactAt });
        break;
      }
      case "cast": {
        const impactAt = ev.t + spellImpactMs(ev.ability, defIds.get(ev.unit) ?? "");
        const cast: CastGroup = { caster: ev.unit, center: ev.target, ability: ev.ability, effects: [], impactAt };
        pending.set(key(ev.unit, ev.t), { impactAt, cast });
        out.push({ at: ev.t, ev, cast });
        break;
      }
      case "death": {
        out.push({ at: Math.max(ev.t, lastHitAt.get(ev.unit) ?? 0), ev });
        break;
      }
      case "end": {
        const last = out.reduce((m, p) => Math.max(m, p.at), ev.t);
        out.push({ at: last + 250, ev });
        break;
      }
      default: {
        const src = sourceOf(ev);
        const p = src !== null ? pending.get(key(src, ev.t)) : undefined;
        const at = p ? p.impactAt : ev.t;
        p?.cast?.effects.push(ev);
        const target = targetOf(ev);
        if (target !== null && ev.type === "damage") lastHitAt.set(target, Math.max(lastHitAt.get(target) ?? 0, at));
        out.push({ at, ev });
      }
    }
  }
  // Tri stable par instant d'affichage.
  return out.map((p, i) => ({ p, i })).sort((a, b) => a.p.at - b.p.at || a.i - b.i).map(({ p }) => p);
}
