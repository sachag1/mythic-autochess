import type { AbilityDef, Stats, TriggerDef, UnitDef } from "../types.js";
import { abilityValues, adRatio, durationValues, roleStats, type Cost, type Role } from "./balance.js";

// 56 unités : 12 à 1 pièce, 12 à 2, 12 à 3, 12 à 4, 8 à 5.
// 8 panthéons de 7 unités (une à 5 pièces chacun), 7 classes de 8 à 10 unités.

function unit(
  id: string,
  name: string,
  cost: Cost,
  traits: string[],
  role: Role,
  ability: AbilityDef,
  tweak?: Partial<Stats>,
): UnitDef {
  const passives = role === "assassin" ? [LEAP_TO_BACKLINE] : [];
  return { id, name, cost, traits, stats: roleStats(role, cost, tweak), ability, passives };
}

/** Comme dans TFT, les assassins sautent sur la ligne arrière ennemie au début du combat. */
const LEAP_TO_BACKLINE: TriggerDef = { on: "combatStart", target: "farthestEnemy", effects: [{ kind: "leap" }] };

export const UNITS: readonly UnitDef[] = [
  // ------------------------------------------------------------------ 1 pièce
  unit("medusa", "Medusa", 1, ["greek", "sorcerer"], "mage", {
    name: "Petrifying Gaze",
    description: "Deals magic damage to her target and turns it to stone.",
    target: "currentTarget",
    castTimeMs: 500,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(1, 120), scaling: "ap", area: { shape: "single" } },
      { kind: "stun", durationMs: durationValues(1250), area: { shape: "single" } },
    ],
  }),
  unit("valkyrie", "Valkyrie", 1, ["norse", "warrior"], "bruiser", {
    name: "Spear of Valhalla",
    description: "Strikes her target and shields herself.",
    target: "currentTarget",
    castTimeMs: 400,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(1.8), scaling: "ad", area: { shape: "single" } },
      { kind: "shield", amount: abilityValues(1, 110), scaling: "ap", durationMs: 4000, area: { shape: "self" } },
    ],
  }),
  unit("bastet", "Bastet", 1, ["egyptian", "trickster"], "assassin", {
    name: "Nine Lives",
    description: "Slashes her target, then attacks much faster for a few seconds.",
    target: "currentTarget",
    castTimeMs: 300,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(3.2), scaling: "ad", area: { shape: "single" } },
      { kind: "buff", stat: "attackSpeedPct", amount: [30, 40, 55], durationMs: 4000, area: { shape: "self" } },
    ],
  }),
  unit("kitsune", "Kitsune", 1, ["japanese", "sorcerer"], "mage", {
    name: "Foxfire",
    description: "Hurls foxfire that burns enemies around the target.",
    target: "currentTarget",
    castTimeMs: 500,
    effects: [{ kind: "damage", damageType: "magic", amount: abilityValues(1, 175), scaling: "ap", area: { shape: "radius", radius: 1 } }],
  }),
  unit("zhubajie", "Zhu Bajie", 1, ["chinese", "guardian"], "tank", {
    name: "Gluttony",
    description: "Heals himself and slams the ground around him.",
    target: "self",
    castTimeMs: 600,
    effects: [
      { kind: "heal", amount: abilityValues(1, 250), scaling: "ap", area: { shape: "self" } },
      { kind: "damage", damageType: "magic", amount: abilityValues(1, 80), scaling: "ap", area: { shape: "radius", radius: 1 } },
    ],
  }),
  unit("selkie", "Selkie", 1, ["celtic", "oracle"], "support", {
    name: "Tidal Song",
    description: "Heals the most wounded ally.",
    target: "lowestHpAlly",
    castTimeMs: 500,
    effects: [{ kind: "heal", amount: abilityValues(1, 160), scaling: "ap", area: { shape: "single" } }],
  }),
  unit("xolotl", "Xolotl", 1, ["aztec", "beast"], "bruiser", {
    name: "Underworld Guide",
    description: "Drains the life of his target.",
    target: "currentTarget",
    castTimeMs: 400,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(1, 170), scaling: "ap", area: { shape: "single" } },
      { kind: "heal", amount: abilityValues(1, 100), scaling: "ap", area: { shape: "self" } },
    ],
  }),
  unit("lamassu", "Lamassu", 1, ["mesopotamian", "guardian"], "tank", {
    name: "Gatekeeper",
    description: "Shields itself and stuns adjacent enemies.",
    target: "self",
    castTimeMs: 600,
    effects: [
      { kind: "shield", amount: abilityValues(1, 190), scaling: "ap", durationMs: 4000, area: { shape: "self" } },
      { kind: "stun", durationMs: durationValues(750), area: { shape: "radius", radius: 1 } },
    ],
  }),

  unit("satyr", "Satyr", 1, ["greek", "hunter"], "marksman", {
    name: "Pan's Frenzy",
    description: "Shoots his target, then plays faster for a few seconds.",
    target: "currentTarget",
    castTimeMs: 400,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(3.1), scaling: "ad", area: { shape: "single" } },
      { kind: "buff", stat: "attackSpeedPct", amount: [20, 25, 35], durationMs: 4000, area: { shape: "self" } },
    ],
  }),
  unit("sobek", "Sobek", 1, ["egyptian", "beast"], "bruiser", {
    name: "Death Roll",
    description: "Drags his target down and stuns it.",
    target: "currentTarget",
    castTimeMs: 500,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(2.4), scaling: "ad", area: { shape: "single" } },
      { kind: "stun", durationMs: durationValues(1250), area: { shape: "single" } },
    ],
  }),
  unit("jiangshi", "Jiangshi", 1, ["chinese", "warrior"], "bruiser", {
    name: "Qi Drain",
    description: "Drains the life force of its target.",
    target: "currentTarget",
    castTimeMs: 400,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(1, 160), scaling: "ap", area: { shape: "single" } },
      { kind: "heal", amount: abilityValues(1, 120), scaling: "ap", area: { shape: "self" } },
    ],
  }),
  unit("jaguar", "Jaguar Warrior", 1, ["aztec", "trickster"], "assassin", {
    name: "Obsidian Claws",
    description: "Tears into his target and hunts for weak spots.",
    target: "currentTarget",
    castTimeMs: 300,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(2.6), scaling: "ad", area: { shape: "single" } },
      { kind: "buff", stat: "critChance", amount: [0.2, 0.2, 0.3], durationMs: 4000, area: { shape: "self" } },
    ],
  }),

  // ------------------------------------------------------------------ 2 pièces
  unit("cyclops", "Cyclops", 2, ["greek", "beast", "guardian"], "tank", {
    name: "Boulder Toss",
    description: "Throws a boulder that damages enemies around the target and stuns it.",
    target: "currentTarget",
    castTimeMs: 700,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(2, 140), scaling: "ap", area: { shape: "radius", radius: 1 } },
      { kind: "stun", durationMs: durationValues(800), area: { shape: "single" } },
    ],
  }),
  unit("skadi", "Skadi", 2, ["norse", "hunter"], "marksman", {
    name: "Winter Volley",
    description: "Fires a volley of icy arrows around her target.",
    target: "currentTarget",
    castTimeMs: 400,
    effects: [{ kind: "damage", damageType: "physical", amount: adRatio(2), scaling: "ad", area: { shape: "radius", radius: 1 } }],
  }),
  unit("sekhmet", "Sekhmet", 2, ["egyptian", "beast"], "bruiser", {
    name: "Bloodlust",
    description: "Gains attack damage and omnivamp for a few seconds.",
    target: "self",
    castTimeMs: 200,
    effects: [
      { kind: "buff", stat: "attackDamage", amount: [45, 65, 100], durationMs: 5000, area: { shape: "self" } },
      { kind: "buff", stat: "omnivamp", amount: [25, 30, 40], durationMs: 5000, area: { shape: "self" } },
    ],
  }),
  unit("tengu", "Tengu", 2, ["japanese", "trickster"], "assassin", {
    name: "Gale Slash",
    description: "A lightning-fast cut on his target.",
    target: "currentTarget",
    castTimeMs: 300,
    effects: [{ kind: "damage", damageType: "physical", amount: adRatio(2.8), scaling: "ad", area: { shape: "single" } }],
  }),
  unit("nezha", "Nezha", 2, ["chinese", "warrior"], "bruiser", {
    name: "Wind Fire Wheels",
    description: "Spins his flaming wheels, burning adjacent enemies.",
    target: "self",
    castTimeMs: 500,
    effects: [{ kind: "damage", damageType: "magic", amount: abilityValues(2, 115), scaling: "ap", area: { shape: "radius", radius: 1 } }],
  }),
  unit("cuchulainn", "Cu Chulainn", 2, ["celtic", "warrior"], "bruiser", {
    name: "Gae Bulg",
    description: "Throws a spear that ignores armor.",
    target: "currentTarget",
    castTimeMs: 400,
    effects: [{ kind: "damage", damageType: "true", amount: adRatio(2.2), scaling: "ad", area: { shape: "single" } }],
  }),
  unit("tlaloc", "Tlaloc", 2, ["aztec", "oracle"], "support", {
    name: "Healing Rain",
    description: "Heals the most wounded ally and those around it.",
    target: "lowestHpAlly",
    castTimeMs: 600,
    effects: [{ kind: "heal", amount: abilityValues(2, 130), scaling: "ap", area: { shape: "radius", radius: 1 } }],
  }),
  unit("enkidu", "Enkidu", 2, ["mesopotamian", "beast"], "bruiser", {
    name: "Wild Charge",
    description: "Rams his target and stuns it.",
    target: "currentTarget",
    castTimeMs: 400,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(2.4), scaling: "ad", area: { shape: "single" } },
      { kind: "stun", durationMs: durationValues(1250), area: { shape: "single" } },
    ],
  }),

  unit("draugr", "Draugr", 2, ["norse", "guardian"], "tank", {
    name: "Barrow Curse",
    description: "Shields himself and curses adjacent enemies.",
    target: "self",
    castTimeMs: 600,
    effects: [
      { kind: "shield", amount: abilityValues(2, 130), scaling: "ap", durationMs: 4000, area: { shape: "self" } },
      { kind: "damage", damageType: "magic", amount: abilityValues(2, 70), scaling: "ap", area: { shape: "radius", radius: 1 } },
    ],
  }),
  unit("kappa", "Kappa", 2, ["japanese", "trickster"], "assassin", {
    name: "River Ambush",
    description: "Strikes his target and stuns it briefly.",
    target: "currentTarget",
    castTimeMs: 300,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(3), scaling: "ad", area: { shape: "single" } },
      { kind: "stun", durationMs: durationValues(750), area: { shape: "single" } },
    ],
  }),
  unit("shawujing", "Sha Wujing", 2, ["chinese", "guardian", "oracle"], "tank", {
    name: "River Guard",
    description: "Shields himself and every nearby ally.",
    target: "self",
    castTimeMs: 600,
    effects: [{ kind: "shield", amount: abilityValues(2, 75), scaling: "ap", durationMs: 4000, area: { shape: "radius", radius: 1 } }],
  }),
  unit("girtablilu", "Scorpion Man", 2, ["mesopotamian", "hunter"], "marksman", {
    name: "Venom Sting",
    description: "Fires a venomous bolt at his target.",
    target: "currentTarget",
    castTimeMs: 400,
    effects: [{ kind: "damage", damageType: "physical", amount: adRatio(2.4), scaling: "ad", area: { shape: "single" } }],
  }),

  // ------------------------------------------------------------------ 3 pièces
  unit("achilles", "Achilles", 3, ["greek", "warrior"], "bruiser", {
    name: "Wrath of Achilles",
    description: "Strikes his target and enters a frenzy of attacks.",
    target: "currentTarget",
    castTimeMs: 300,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(1.5), scaling: "ad", area: { shape: "single" } },
      { kind: "buff", stat: "attackSpeedPct", amount: [50, 60, 80], durationMs: 6000, area: { shape: "self" } },
    ],
  }),
  unit("loki", "Loki", 3, ["norse", "trickster"], "assassin", {
    name: "Shapeshift",
    description: "Blasts his target with trickery and sharpens his blades.",
    target: "currentTarget",
    castTimeMs: 300,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(3, 160), scaling: "ap", area: { shape: "single" } },
      { kind: "buff", stat: "critChance", amount: [0.3, 0.3, 0.4], durationMs: 5000, area: { shape: "self" } },
    ],
  }),
  unit("anubis", "Anubis", 3, ["egyptian", "guardian"], "tank", {
    name: "Weighing of the Heart",
    description: "Shields himself and judges every enemy nearby.",
    target: "self",
    castTimeMs: 600,
    effects: [
      { kind: "shield", amount: abilityValues(3, 190), scaling: "ap", durationMs: 4000, area: { shape: "self" } },
      { kind: "damage", damageType: "magic", amount: abilityValues(3, 70), scaling: "ap", area: { shape: "radius", radius: 2 } },
    ],
  }),
  unit("raijin", "Raijin", 3, ["japanese", "sorcerer"], "mage", {
    name: "Thunder Drums",
    description: "Strikes the healthiest enemy and those around it with lightning.",
    target: "highestHpEnemy",
    castTimeMs: 600,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(3, 135), scaling: "ap", area: { shape: "radius", radius: 1 } },
      { kind: "stun", durationMs: durationValues(750), area: { shape: "single" } },
    ],
  }),
  unit("houyi", "Hou Yi", 3, ["chinese", "hunter"], "marksman", {
    name: "Sunshooter",
    description: "Shoots the farthest enemy with a piercing arrow.",
    target: "farthestEnemy",
    castTimeMs: 500,
    effects: [{ kind: "damage", damageType: "physical", amount: adRatio(4), scaling: "ad", area: { shape: "single" } }],
  }),
  unit("morrigan", "Morrigan", 3, ["celtic", "sorcerer"], "mage", {
    name: "Crow Swarm",
    description: "Sends crows to tear at every enemy around her target.",
    target: "currentTarget",
    castTimeMs: 600,
    effects: [{ kind: "damage", damageType: "magic", amount: abilityValues(3, 95), scaling: "ap", area: { shape: "radius", radius: 2 } }],
  }),
  unit("huitzilopochtli", "Huitzilopochtli", 3, ["aztec", "hunter"], "marksman", {
    name: "Xiuhcoatl",
    description: "Launches a fire serpent at his target and grows stronger with each cast.",
    target: "currentTarget",
    castTimeMs: 500,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(2.2), scaling: "ad", area: { shape: "radius", radius: 1 } },
      { kind: "buff", stat: "damageAmp", amount: [10, 12, 15], area: { shape: "self" } },
    ],
  }),
  unit("ishtar", "Ishtar", 3, ["mesopotamian", "hunter"], "marksman", {
    name: "Morning Star",
    description: "Shoots her target with starlight and permanently attacks faster.",
    target: "currentTarget",
    castTimeMs: 400,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(3, 105), scaling: "ap", area: { shape: "single" } },
      { kind: "buff", stat: "attackSpeedPct", amount: [10, 15, 20], area: { shape: "self" } },
    ],
  }),

  unit("freyja", "Freyja", 3, ["norse", "hunter"], "marksman", {
    name: "Falcon Dive",
    description: "Sends her falcon cloak crashing into her target and those around it.",
    target: "currentTarget",
    castTimeMs: 500,
    effects: [{ kind: "damage", damageType: "physical", amount: adRatio(2.5), scaling: "ad", area: { shape: "radius", radius: 1 } }],
  }),
  unit("isis", "Isis", 3, ["egyptian", "oracle"], "support", {
    name: "Breath of Life",
    description: "Heals and shields the most wounded ally.",
    target: "lowestHpAlly",
    castTimeMs: 500,
    effects: [
      { kind: "heal", amount: abilityValues(3, 95), scaling: "ap", area: { shape: "single" } },
      { kind: "shield", amount: abilityValues(3, 70), scaling: "ap", durationMs: 4000, area: { shape: "single" } },
    ],
  }),
  unit("banshee", "Banshee", 3, ["celtic", "sorcerer", "trickster"], "mage", {
    name: "Keening Wail",
    description: "Wails at the healthiest enemy, hurting everyone around it.",
    target: "highestHpEnemy",
    castTimeMs: 600,
    effects: [{ kind: "damage", damageType: "magic", amount: abilityValues(3, 150), scaling: "ap", area: { shape: "radius", radius: 1 } }],
  }),
  unit("mictlantecuhtli", "Mictlantecuhtli", 3, ["aztec", "oracle"], "support", {
    name: "Bone Harvest",
    description: "Reaps the life of his target and shares it with every ally.",
    target: "currentTarget",
    castTimeMs: 600,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(3, 200), scaling: "ap", area: { shape: "single" } },
      { kind: "heal", amount: abilityValues(3, 45), scaling: "ap", area: { shape: "all" } },
    ],
  }),

  // ------------------------------------------------------------------ 4 pièces
  unit("athena", "Athena", 4, ["greek", "guardian", "oracle"], "tank", {
    name: "Aegis",
    description: "Shields nearby allies and stuns adjacent enemies.",
    target: "self",
    castTimeMs: 700,
    effects: [
      { kind: "shield", amount: abilityValues(4, 85), scaling: "ap", durationMs: 4000, area: { shape: "radius", radius: 2 } },
      { kind: "stun", durationMs: durationValues(1250), area: { shape: "radius", radius: 1 } },
    ],
  }),
  unit("fenrir", "Fenrir", 4, ["norse", "beast"], "bruiser", {
    name: "Devour",
    description: "Bites his target for massive damage and heals.",
    target: "currentTarget",
    castTimeMs: 500,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(3), scaling: "ad", area: { shape: "single" } },
      { kind: "heal", amount: abilityValues(4, 80), scaling: "ap", area: { shape: "self" } },
    ],
  }),
  unit("susanoo", "Susanoo", 4, ["japanese", "warrior"], "bruiser", {
    name: "Storm Blade",
    description: "Cuts every adjacent enemy and hardens himself.",
    target: "self",
    castTimeMs: 500,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(3.6), scaling: "ad", area: { shape: "radius", radius: 1 } },
      { kind: "buff", stat: "armor", amount: [40, 60, 80], durationMs: 5000, area: { shape: "self" } },
    ],
  }),
  unit("quetzalcoatl", "Quetzalcoatl", 4, ["aztec", "beast"], "mage", {
    name: "Feathered Serpent",
    description: "Sweeps a wide area around the target with divine wind.",
    target: "currentTarget",
    castTimeMs: 700,
    effects: [{ kind: "damage", damageType: "magic", amount: abilityValues(4, 150), scaling: "ap", area: { shape: "radius", radius: 2 } }],
  }),
  unit("dagda", "The Dagda", 4, ["celtic", "guardian"], "tank", {
    name: "Cauldron of Plenty",
    description: "Heals every ally and shields himself.",
    target: "self",
    castTimeMs: 700,
    effects: [
      { kind: "heal", amount: abilityValues(4, 35), scaling: "ap", area: { shape: "all" } },
      { kind: "shield", amount: abilityValues(4, 200), scaling: "ap", durationMs: 4000, area: { shape: "self" } },
    ],
  }),

  unit("hades", "Hades", 4, ["greek", "sorcerer", "trickster"], "mage", {
    name: "Helm of Darkness",
    description: "Appears behind the farthest enemy, blasting and stunning it.",
    target: "farthestEnemy",
    castTimeMs: 600,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(4, 160), scaling: "ap", area: { shape: "single" } },
      { kind: "stun", durationMs: durationValues(750), area: { shape: "single" } },
    ],
  }),
  unit("set", "Set", 4, ["egyptian", "beast", "warrior"], "bruiser", {
    name: "Sandstorm",
    description: "Whips up a sandstorm around him and attacks in a frenzy.",
    target: "self",
    castTimeMs: 400,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(4, 130), scaling: "ap", area: { shape: "radius", radius: 1 } },
      { kind: "buff", stat: "attackSpeedPct", amount: [40, 50, 80], durationMs: 5000, area: { shape: "self" } },
    ],
  }),
  unit("yukionna", "Yuki-onna", 4, ["japanese", "sorcerer"], "mage", {
    name: "Frozen Breath",
    description: "Freezes her target solid and chills those around it.",
    target: "currentTarget",
    castTimeMs: 600,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(4, 106), scaling: "ap", area: { shape: "radius", radius: 1 } },
      { kind: "stun", durationMs: durationValues(1250), area: { shape: "single" } },
    ],
  }),
  unit("erlangshen", "Erlang Shen", 4, ["chinese", "hunter"], "marksman", {
    name: "Third Eye",
    description: "Pierces his target and those around it, and permanently deals more damage.",
    target: "currentTarget",
    castTimeMs: 500,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(2.6), scaling: "ad", area: { shape: "radius", radius: 1 } },
      { kind: "buff", stat: "damageAmp", amount: [10, 12, 18], area: { shape: "self" } },
    ],
  }),
  unit("cernunnos", "Cernunnos", 4, ["celtic", "oracle"], "support", {
    name: "Wild Growth",
    description: "Heals every ally and makes them attack faster.",
    target: "self",
    castTimeMs: 700,
    effects: [
      { kind: "heal", amount: abilityValues(4, 60), scaling: "ap", area: { shape: "all" } },
      { kind: "buff", stat: "attackSpeedPct", amount: [15, 20, 30], durationMs: 4000, area: { shape: "all" } },
    ],
  }),
  unit("tiamat", "Tiamat", 4, ["mesopotamian", "beast", "sorcerer"], "mage", {
    name: "Primordial Flood",
    description: "Floods a wide area around her target.",
    target: "currentTarget",
    castTimeMs: 700,
    effects: [{ kind: "damage", damageType: "magic", amount: abilityValues(4, 105), scaling: "ap", area: { shape: "radius", radius: 2 } }],
  }),
  unit("marduk", "Marduk", 4, ["mesopotamian", "warrior", "guardian"], "tank", {
    name: "Storm Net",
    description: "Throws a storm net that hits and stuns adjacent enemies, and shields himself.",
    target: "self",
    castTimeMs: 600,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(4, 120), scaling: "ap", area: { shape: "radius", radius: 1 } },
      { kind: "stun", durationMs: durationValues(1000), area: { shape: "radius", radius: 1 } },
      { kind: "shield", amount: abilityValues(4, 140), scaling: "ap", durationMs: 4000, area: { shape: "self" } },
    ],
  }),

  // ------------------------------------------------------------------ 5 pièces
  unit("zeus", "Zeus", 5, ["greek", "sorcerer"], "mage", {
    name: "Thunderbolt",
    description: "Strikes the healthiest enemy and those around it, stunning the target.",
    target: "highestHpEnemy",
    castTimeMs: 700,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(5, 120), scaling: "ap", area: { shape: "radius", radius: 1 } },
      { kind: "stun", durationMs: durationValues(1000), area: { shape: "single" } },
    ],
  }),
  unit("ra", "Ra", 5, ["egyptian", "oracle"], "support", {
    name: "Solar Flare",
    description: "Burns every enemy and heals every ally.",
    target: "self",
    castTimeMs: 800,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(5, 60), scaling: "ap", area: { shape: "all" } },
      { kind: "heal", amount: abilityValues(5, 50), scaling: "ap", area: { shape: "all" } },
    ],
  }),
  unit("wukong", "Sun Wukong", 5, ["chinese", "trickster"], "assassin", {
    name: "Seventy-Two Transformations",
    description: "Smashes his target and those around it, and his crits grow deadlier.",
    target: "currentTarget",
    castTimeMs: 400,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(3.6), scaling: "ad", area: { shape: "radius", radius: 1 } },
      { kind: "buff", stat: "critDamage", amount: [0.3, 0.3, 0.6], area: { shape: "self" } },
    ],
  }),
  unit("gilgamesh", "Gilgamesh", 5, ["mesopotamian", "warrior"], "bruiser", {
    name: "King of Uruk",
    description: "Cleaves adjacent enemies and becomes nearly unbreakable.",
    target: "self",
    castTimeMs: 500,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(3.2), scaling: "ad", area: { shape: "radius", radius: 1 } },
      { kind: "buff", stat: "durability", amount: [30, 30, 45], durationMs: 4000, area: { shape: "self" } },
    ],
  }),
  unit("thor", "Thor", 5, ["norse", "warrior"], "bruiser", {
    name: "Thunder God's Wrath",
    description: "Calls lightning down on his target and those around it, stunning the target.",
    target: "currentTarget",
    castTimeMs: 500,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(5, 170), scaling: "ap", area: { shape: "radius", radius: 1 } },
      { kind: "stun", durationMs: durationValues(1000), area: { shape: "single" } },
    ],
  }),
  unit("orochi", "Yamata no Orochi", 5, ["japanese", "beast"], "bruiser", {
    name: "Eight Heads",
    description: "Bites every adjacent enemy and regenerates.",
    target: "self",
    castTimeMs: 500,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(5, 100), scaling: "ap", area: { shape: "radius", radius: 1 } },
      { kind: "heal", amount: abilityValues(5, 120), scaling: "ap", area: { shape: "self" } },
    ],
  }),
  unit("lugh", "Lugh", 5, ["celtic", "hunter"], "marksman", {
    name: "Spear of Assal",
    description: "Hurls his spear at his target and those around it, and permanently attacks faster.",
    target: "currentTarget",
    castTimeMs: 400,
    effects: [
      { kind: "damage", damageType: "physical", amount: adRatio(2.4), scaling: "ad", area: { shape: "radius", radius: 1 } },
      { kind: "buff", stat: "attackSpeedPct", amount: [20, 25, 50], area: { shape: "self" } },
    ],
  }),
  unit("tezcatlipoca", "Tezcatlipoca", 5, ["aztec", "trickster"], "assassin", {
    name: "Smoking Mirror",
    description: "Blasts his target with dark magic and sharpens his blades.",
    target: "currentTarget",
    castTimeMs: 300,
    effects: [
      { kind: "damage", damageType: "magic", amount: abilityValues(5, 250), scaling: "ap", area: { shape: "single" } },
      { kind: "buff", stat: "critChance", amount: [0.3, 0.3, 0.5], durationMs: 5000, area: { shape: "self" } },
    ],
  }),
];
