// Données de jeu partagées avec le serveur (modules purs, sans réseau).
import { createContent, ITEMS, TRAITS, UNITS, type ItemDef, type TraitDef, type UnitDef } from "@autochess/sim";
import { AUGMENTS_BY_ID, type AugmentDef, type AugmentTier } from "@autochess/server/src/game/augments";
import { OMENS_BY_ID, type OmenDef } from "@autochess/server/src/game/omens";

export const CONTENT = createContent();
export { ITEMS, TRAITS, UNITS };

export const unitDef = (id: string): UnitDef | undefined => CONTENT.units.get(id);
export const traitDef = (id: string): TraitDef | undefined => CONTENT.traits.get(id);
export const itemDef = (id: string): ItemDef | undefined => CONTENT.items.get(id);
export const omenDef = (id: string): OmenDef | undefined => OMENS_BY_ID.get(id);
export const augmentDef = (id: string): AugmentDef | undefined => AUGMENTS_BY_ID.get(id);

export const COMPONENT_IDS = new Set(ITEMS.filter((i) => !i.components).map((i) => i.id));

/** Couleur de chaque panthéon (origine). */
export const PANTHEON_COLORS: Record<string, string> = {
  greek: "#e8e1cf",
  norse: "#6fa8dc",
  egyptian: "#e6b43c",
  japanese: "#e0525a",
  chinese: "#d93a2b",
  celtic: "#4caf6a",
  aztec: "#2bb3a3",
  mesopotamian: "#b0703a",
};
export const MONSTER_COLOR = "#7d7d86";

/** Couleur des cadres selon le coût, comme TFT. */
export const COST_COLORS: Record<number, string> = {
  1: "#9aa0a6",
  2: "#3cb371",
  3: "#3d8bfd",
  4: "#b05cf0",
  5: "#f0b429",
};

export const TIER_LABELS: Record<AugmentTier, string> = { silver: "Argent", gold: "Or", prismatic: "Prismatique" };

/** Couleur et abréviation de chaque objet (icônes en attendant de vraies images). */
export const ITEM_STYLE: Record<string, { color: string; short: string }> = {
  sword: { color: "#d9534f", short: "Ép" },
  bow: { color: "#f0ad4e", short: "Arc" },
  rod: { color: "#7b68ee", short: "Bâ" },
  tear: { color: "#5bc0de", short: "Eau" },
  vest: { color: "#8d6e63", short: "Cu" },
  cloak: { color: "#9c27b0", short: "Ca" },
  belt: { color: "#e91e63", short: "Ce" },
  glove: { color: "#26a69a", short: "Ga" },
};

export function itemStyle(id: string): { color: string; short: string } {
  const known = ITEM_STYLE[id];
  if (known) return known;
  // Objet complet (ou inconnu) : couleur dérivée de l'identifiant, fond doré.
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  const name = itemDef(id)?.name ?? id;
  return { color: `hsl(${h} 65% 45%)`, short: name.slice(0, 2) };
}

export function originOf(def: UnitDef | undefined): string | undefined {
  return def?.traits.find((t) => traitDef(t)?.kind === "origin");
}
export function classOf(def: UnitDef | undefined): string | undefined {
  return def?.traits.find((t) => traitDef(t)?.kind === "class");
}

export function unitColor(def: UnitDef | undefined): string {
  const origin = originOf(def);
  return (origin && PANTHEON_COLORS[origin]) || MONSTER_COLOR;
}

/** Prix de revente, même formule que le serveur. */
export function sellValue(defId: string, star: number): number {
  const def = unitDef(defId);
  if (!def) return 0;
  const copies = star === 3 ? 9 : star === 2 ? 3 : 1;
  return def.cost * copies - (star > 1 && def.cost > 1 ? 1 : 0);
}
