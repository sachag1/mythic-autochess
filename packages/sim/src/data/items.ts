import type { ItemDef } from "../types.js";
import { flat } from "./balance.js";

// 8 composants de base, combinables deux à deux en objets complets (artefacts mythiques).
// Seule une partie des combinaisons est définie pour l'instant.

export const ITEMS: readonly ItemDef[] = [
  // ------------------------------------------------------------------ composants
  { id: "sword", name: "Bronze Sword", description: "+12 attack damage.", stats: { attackDamage: 12 } },
  { id: "bow", name: "Yew Bow", description: "+12% attack speed.", stats: { attackSpeedPct: 12 } },
  { id: "rod", name: "Oak Wand", description: "+15 ability power.", stats: { abilityPower: 15 } },
  { id: "tear", name: "Sacred Water", description: "+15 starting mana.", stats: { startMana: 15 } },
  { id: "vest", name: "Bronze Breastplate", description: "+20 armor.", stats: { armor: 20 } },
  { id: "cloak", name: "Woven Cloak", description: "+20 magic resist.", stats: { magicResist: 20 } },
  { id: "belt", name: "Leather Belt", description: "+150 health.", stats: { maxHp: 150 } },
  { id: "glove", name: "Hunter's Glove", description: "+15% critical strike chance.", stats: { critChance: 0.15 } },

  // ------------------------------------------------------------------ objets complets
  {
    id: "gungnir",
    name: "Gungnir",
    description: "Every third attack deals 70 bonus true damage.",
    components: ["sword", "bow"],
    stats: { attackDamage: 15, attackSpeedPct: 15 },
    triggers: [{ on: "everyNAttacks", n: 3, target: "currentTarget", effects: [{ kind: "damage", damageType: "true", amount: flat(70), scaling: "none", area: { shape: "single" } }] }],
  },
  {
    id: "aegis",
    name: "Aegis",
    description: "Starts combat with a 300 shield.",
    components: ["vest", "cloak"],
    stats: { armor: 25, magicResist: 25 },
    triggers: [{ on: "combatStart", target: "self", effects: [{ kind: "shield", amount: flat(300), scaling: "none", durationMs: 10000, area: { shape: "self" } }] }],
  },
  {
    id: "golden_fleece",
    name: "Golden Fleece",
    description: "Heals 40 health every 2 seconds.",
    components: ["belt", "belt"],
    stats: { maxHp: 400 },
    triggers: [{ on: "interval", everyMs: 2000, target: "self", effects: [{ kind: "heal", amount: flat(40), scaling: "none", area: { shape: "self" } }] }],
  },
  {
    id: "ambrosia",
    name: "Ambrosia",
    description: "After casting, heals for 120.",
    components: ["rod", "tear"],
    stats: { abilityPower: 20, startMana: 15 },
    triggers: [{ on: "onCast", target: "self", effects: [{ kind: "heal", amount: flat(120), scaling: "ap", area: { shape: "self" } }] }],
  },
  {
    id: "excalibur",
    name: "Excalibur",
    description: "+35% critical strike damage.",
    components: ["sword", "glove"],
    stats: { attackDamage: 15, critChance: 0.2, critDamage: 0.35 },
  },
  {
    id: "mjolnir",
    name: "Mjolnir",
    description: "Every fourth attack strikes enemies around the target with lightning.",
    components: ["bow", "rod"],
    stats: { attackSpeedPct: 15, abilityPower: 15 },
    triggers: [{ on: "everyNAttacks", n: 4, target: "currentTarget", effects: [{ kind: "damage", damageType: "magic", amount: flat(80), scaling: "ap", area: { shape: "radius", radius: 1 } }] }],
  },
];
