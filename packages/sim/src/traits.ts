import type { TraitBreakpoint, TraitDef, UnitDef } from "./types.js";

export interface ActiveTrait {
  trait: TraitDef;
  count: number;
  breakpoint: TraitBreakpoint;
}

/** Compte chaque synergie une seule fois par unité différente (deux copies = une seule). */
export function countTraits(defs: readonly UnitDef[]): Map<string, number> {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const def of defs) {
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    for (const traitId of def.traits) {
      counts.set(traitId, (counts.get(traitId) ?? 0) + 1);
    }
  }
  return counts;
}

export function highestBreakpoint(trait: TraitDef, count: number): TraitBreakpoint | null {
  let best: TraitBreakpoint | null = null;
  for (const bp of trait.breakpoints) {
    if (count >= bp.count) best = bp;
  }
  return best;
}

export function activeTraits(
  defs: readonly UnitDef[],
  traits: ReadonlyMap<string, TraitDef>,
): ActiveTrait[] {
  const out: ActiveTrait[] = [];
  for (const [traitId, count] of countTraits(defs)) {
    const trait = traits.get(traitId);
    if (!trait) throw new Error(`Unknown trait "${traitId}"`);
    const breakpoint = highestBreakpoint(trait, count);
    if (breakpoint) out.push({ trait, count, breakpoint });
  }
  // Ordre stable pour que la simulation reste déterministe.
  return out.sort((a, b) => a.trait.id.localeCompare(b.trait.id));
}
