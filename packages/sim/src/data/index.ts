import type { Content } from "../types.js";
import { ITEMS } from "./items.js";
import { TRAITS } from "./traits.js";
import { UNITS } from "./units.js";

export { ITEMS, TRAITS, UNITS };
export * from "./balance.js";
export * from "./shop.js";

export function createContent(): Content {
  return {
    units: new Map(UNITS.map((u) => [u.id, u])),
    traits: new Map(TRAITS.map((t) => [t.id, t])),
    items: new Map(ITEMS.map((i) => [i.id, i])),
  };
}
