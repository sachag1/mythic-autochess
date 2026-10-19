import type { Content } from "../types.js";
import { ITEMS } from "./items.js";
import { MONSTERS } from "./pve.js";
import { TRAITS } from "./traits.js";
import { UNITS } from "./units.js";

export { ITEMS, MONSTERS, TRAITS, UNITS };
export * from "./balance.js";
export * from "./shop.js";
export { PVE_WAVES, pveWave } from "./pve.js";

export function createContent(): Content {
  return {
    units: new Map([...UNITS, ...MONSTERS].map((u) => [u.id, u])),
    traits: new Map(TRAITS.map((t) => [t.id, t])),
    items: new Map(ITEMS.map((i) => [i.id, i])),
  };
}
