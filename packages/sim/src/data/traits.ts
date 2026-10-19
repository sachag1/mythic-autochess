import type { TraitDef } from "../types.js";
import { flat } from "./balance.js";

// Origines = panthéons. Classes = rôles au combat.

export const TRAITS: readonly TraitDef[] = [
  // ------------------------------------------------------------------ origines
  {
    id: "greek",
    name: "Olympian",
    kind: "origin",
    description: "Olympians gain ability power. From 4, they also gain mana every 3 seconds.",
    breakpoints: [
      { count: 2, scope: "members", stats: { abilityPower: 25 } },
      {
        count: 4,
        scope: "members",
        stats: { abilityPower: 30 },
        triggers: [{ on: "interval", everyMs: 3000, target: "self", effects: [{ kind: "mana", amount: flat(6), area: { shape: "self" } }] }],
      },
      {
        count: 6,
        scope: "members",
        stats: { abilityPower: 80 },
        triggers: [{ on: "interval", everyMs: 3000, target: "self", effects: [{ kind: "mana", amount: flat(20), area: { shape: "self" } }] }],
      },
    ],
  },
  {
    id: "norse",
    name: "Einherjar",
    kind: "origin",
    description: "Each time an ally dies, Einherjar permanently gain attack damage and attack speed.",
    breakpoints: [
      {
        count: 2,
        scope: "members",
        triggers: [{ on: "onAllyDeath", target: "self", effects: [
          { kind: "buff", stat: "attackDamage", amount: flat(15), area: { shape: "self" } },
          { kind: "buff", stat: "attackSpeedPct", amount: flat(15), area: { shape: "self" } },
        ] }],
      },
      {
        count: 4,
        scope: "members",
        triggers: [{ on: "onAllyDeath", target: "self", effects: [
          { kind: "buff", stat: "attackDamage", amount: flat(30), area: { shape: "self" } },
          { kind: "buff", stat: "attackSpeedPct", amount: flat(30), area: { shape: "self" } },
        ] }],
      },
      {
        count: 6,
        scope: "members",
        triggers: [{ on: "onAllyDeath", target: "self", effects: [
          { kind: "buff", stat: "attackDamage", amount: flat(50), area: { shape: "self" } },
          { kind: "buff", stat: "attackSpeedPct", amount: flat(50), area: { shape: "self" } },
        ] }],
      },
    ],
  },
  {
    id: "egyptian",
    name: "Sun Court",
    kind: "origin",
    description: "Every 4 seconds, each Sun Court member heals the most wounded ally.",
    breakpoints: [
      { count: 2, scope: "members", triggers: [{ on: "interval", everyMs: 4000, target: "lowestHpAlly", effects: [{ kind: "heal", amount: flat(80), scaling: "ap", area: { shape: "single" } }] }] },
      { count: 4, scope: "members", triggers: [{ on: "interval", everyMs: 4000, target: "lowestHpAlly", effects: [{ kind: "heal", amount: flat(150), scaling: "ap", area: { shape: "single" } }] }] },
      { count: 6, scope: "members", triggers: [{ on: "interval", everyMs: 4000, target: "lowestHpAlly", effects: [{ kind: "heal", amount: flat(200), scaling: "ap", area: { shape: "single" } }] }] },
    ],
  },
  {
    id: "japanese",
    name: "Kami",
    kind: "origin",
    description: "Kami start combat with extra mana. From 4, they gain extra mana on every attack.",
    breakpoints: [
      { count: 2, scope: "members", stats: { startMana: 30 } },
      { count: 4, scope: "members", stats: { startMana: 55 }, triggers: [{ on: "everyNAttacks", n: 1, target: "self", effects: [{ kind: "mana", amount: flat(6), area: { shape: "self" } }] }] },
      { count: 6, scope: "members", stats: { startMana: 90 }, triggers: [{ on: "everyNAttacks", n: 1, target: "self", effects: [{ kind: "mana", amount: flat(12), area: { shape: "self" } }] }] },
    ],
  },
  {
    id: "chinese",
    name: "Celestial",
    kind: "origin",
    description: "The whole team gains omnivamp.",
    breakpoints: [
      { count: 2, scope: "team", stats: { omnivamp: 8 } },
      { count: 4, scope: "team", stats: { omnivamp: 18 } },
      { count: 6, scope: "team", stats: { omnivamp: 30 } },
    ],
  },
  {
    id: "celtic",
    name: "Fae",
    kind: "origin",
    description: "Fae start combat with a shield.",
    breakpoints: [
      { count: 2, scope: "members", triggers: [{ on: "combatStart", target: "self", effects: [{ kind: "shield", amount: flat(180), scaling: "none", durationMs: 8000, area: { shape: "self" } }] }] },
      { count: 4, scope: "members", triggers: [{ on: "combatStart", target: "self", effects: [{ kind: "shield", amount: flat(450), scaling: "none", durationMs: 8000, area: { shape: "self" } }] }] },
      { count: 6, scope: "members", triggers: [{ on: "combatStart", target: "self", effects: [{ kind: "shield", amount: flat(1100), scaling: "none", durationMs: 8000, area: { shape: "self" } }] }] },
    ],
  },
  {
    id: "aztec",
    name: "Fifth Sun",
    kind: "origin",
    description: "Fifth Sun members deal increased damage.",
    breakpoints: [
      { count: 2, scope: "members", stats: { damageAmp: 15 } },
      { count: 4, scope: "members", stats: { damageAmp: 38 } },
      { count: 6, scope: "members", stats: { damageAmp: 75 } },
    ],
  },
  {
    id: "mesopotamian",
    name: "Ziggurat",
    kind: "origin",
    description: "Ziggurat members gain armor and magic resist.",
    breakpoints: [
      { count: 2, scope: "members", stats: { armor: 25, magicResist: 25 } },
      { count: 4, scope: "members", stats: { armor: 38, magicResist: 38 } },
      { count: 6, scope: "members", stats: { armor: 110, magicResist: 110 } },
    ],
  },

  // ------------------------------------------------------------------ classes
  {
    id: "guardian",
    name: "Guardian",
    kind: "class",
    description: "Guardians gain durability. At 6, the whole team does.",
    breakpoints: [
      { count: 2, scope: "members", stats: { durability: 6 } },
      { count: 4, scope: "members", stats: { durability: 12 } },
      { count: 6, scope: "team", stats: { durability: 20 } },
    ],
  },
  {
    id: "warrior",
    name: "Warrior",
    kind: "class",
    description: "Each attack grants Warriors stacking attack speed.",
    breakpoints: [
      { count: 2, scope: "members", triggers: [{ on: "everyNAttacks", n: 1, target: "self", effects: [{ kind: "buff", stat: "attackSpeedPct", amount: flat(3), area: { shape: "self" } }] }] },
      { count: 4, scope: "members", triggers: [{ on: "everyNAttacks", n: 1, target: "self", effects: [{ kind: "buff", stat: "attackSpeedPct", amount: flat(9), area: { shape: "self" } }] }] },
      { count: 6, scope: "members", triggers: [{ on: "everyNAttacks", n: 1, target: "self", effects: [{ kind: "buff", stat: "attackSpeedPct", amount: flat(18), area: { shape: "self" } }] }] },
    ],
  },
  {
    id: "beast",
    name: "Beast",
    kind: "class",
    description: "Beasts gain bonus health.",
    breakpoints: [
      { count: 2, scope: "members", stats: { maxHp: 200 } },
      { count: 4, scope: "members", stats: { maxHp: 550 } },
      { count: 6, scope: "members", stats: { maxHp: 1000 } },
    ],
  },
  {
    id: "hunter",
    name: "Hunter",
    kind: "class",
    description: "Hunters gain attack speed. From 4, they also gain 1 range.",
    breakpoints: [
      { count: 2, scope: "members", stats: { attackSpeedPct: 20 } },
      { count: 4, scope: "members", stats: { attackSpeedPct: 55, range: 1 } },
      { count: 6, scope: "members", stats: { attackSpeedPct: 80, range: 1 } },
    ],
  },
  {
    id: "sorcerer",
    name: "Sorcerer",
    kind: "class",
    description: "Sorcerers gain ability power.",
    breakpoints: [
      { count: 2, scope: "members", stats: { abilityPower: 25 } },
      { count: 4, scope: "members", stats: { abilityPower: 50 } },
      { count: 6, scope: "members", stats: { abilityPower: 110 } },
    ],
  },
  {
    id: "trickster",
    name: "Trickster",
    kind: "class",
    description: "Tricksters gain critical strike chance and critical damage.",
    breakpoints: [
      { count: 2, scope: "members", stats: { critChance: 0.2, critDamage: 0.2 } },
      { count: 4, scope: "members", stats: { critChance: 0.5, critDamage: 0.6 } },
      { count: 6, scope: "members", stats: { critChance: 0.7, critDamage: 1 } },
    ],
  },
  {
    id: "oracle",
    name: "Oracle",
    kind: "class",
    description: "Every 5 seconds, Oracles shield their most wounded ally.",
    breakpoints: [
      { count: 2, scope: "members", triggers: [{ on: "interval", everyMs: 5000, target: "lowestHpAlly", effects: [{ kind: "shield", amount: flat(70), scaling: "ap", durationMs: 4000, area: { shape: "single" } }] }] },
      { count: 4, scope: "members", triggers: [{ on: "interval", everyMs: 5000, target: "lowestHpAlly", effects: [{ kind: "shield", amount: flat(130), scaling: "ap", durationMs: 4000, area: { shape: "single" } }] }] },
      { count: 6, scope: "members", triggers: [{ on: "interval", everyMs: 5000, target: "lowestHpAlly", effects: [{ kind: "shield", amount: flat(550), scaling: "ap", durationMs: 4000, area: { shape: "single" } }] }] },
    ],
  },
];
