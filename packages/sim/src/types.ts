import type { Hex } from "./hex.js";

export type Team = 0 | 1;
export type StarLevel = 1 | 2 | 3;
export type DamageType = "physical" | "magic" | "true";
/** Une valeur par niveau d'étoiles : [★1, ★2, ★3]. */
export type StarValues = readonly [number, number, number];

export interface Stats {
  maxHp: number;
  attackDamage: number;
  /** Puissance des sorts en %, 100 = valeurs de base. */
  abilityPower: number;
  armor: number;
  magicResist: number;
  /** Attaques par seconde de base. */
  attackSpeed: number;
  /** Bonus de vitesse d'attaque en % de la vitesse de base. */
  attackSpeedPct: number;
  /** Portée en cases. */
  range: number;
  /** Probabilité de coup critique, entre 0 et 1. */
  critChance: number;
  /** Multiplicateur des coups critiques (1.4 = +40 %). */
  critDamage: number;
  startMana: number;
  maxMana: number;
  /** Dégâts infligés en plus, en %. */
  damageAmp: number;
  /** Dégâts reçus en moins, en %. */
  durability: number;
  /** Soin en % des dégâts infligés. */
  omnivamp: number;
}

export type StatKey = keyof Stats;
export type StatBonus = Partial<Stats>;

/** Choix de la cible (ou du centre de la zone) d'un sort ou d'un déclencheur. */
export type TargetRule =
  | "currentTarget"
  | "self"
  | "lowestHpAlly"
  | "farthestEnemy"
  | "highestHpEnemy";

export type AreaDef =
  | { shape: "self" }
  | { shape: "single" }
  | { shape: "radius"; radius: number }
  | { shape: "all" };

/** Les effets touchent soit les ennemis, soit les alliés de celui qui les lance. */
export type Affects = "enemies" | "allies";

/**
 * "ap" : montant × puissance / 100. "ad" : montant × dégâts d'attaque (montant = ratio).
 * "maxHp" : montant en % des PV max de celui qui lance l'effet.
 */
export type Scaling = "ap" | "ad" | "maxHp" | "none";

/** Résistances qu'un effet « sunder » peut réduire. */
export type ResistKey = "armor" | "magicResist";

export type EffectDef =
  | {
      kind: "damage";
      damageType: DamageType;
      amount: StarValues;
      scaling: Scaling;
      area: AreaDef;
    }
  | { kind: "heal"; amount: StarValues; scaling: Scaling; area: AreaDef; affects?: Affects }
  | {
      kind: "shield";
      amount: StarValues;
      scaling: Scaling;
      durationMs: number;
      area: AreaDef;
      affects?: Affects;
    }
  | { kind: "stun"; durationMs: StarValues; area: AreaDef }
  | { kind: "mana"; amount: StarValues; area: AreaDef; affects?: Affects }
  /** Saute sur une case libre à côté de la cible (assassins). */
  | { kind: "leap" }
  | {
      kind: "buff";
      stat: StatKey;
      amount: StarValues;
      /** Absent = jusqu'à la fin du combat. */
      durationMs?: number;
      area: AreaDef;
      affects?: Affects;
    }
  /**
   * Brûlure : dégâts bruts égaux à `percentMaxHp` % des PV max de la cible chaque seconde.
   * Ne se cumule pas : la plus forte s'applique, une nouvelle brûlure rafraîchit la durée.
   */
  | { kind: "burn"; percentMaxHp: number; durationMs: number; area: AreaDef }
  /** Blessure : la cible reçoit `percent` % de soins en moins (la plus forte s'applique). */
  | { kind: "wound"; percent: number; durationMs: number; area: AreaDef }
  /** Réduit l'armure ou la résistance magique de la cible de `percent` % (la plus forte s'applique). */
  | { kind: "sunder"; stat: ResistKey; percent: number; durationMs: number; area: AreaDef }
  /** La cible ne peut plus être étourdie pendant `durationMs`. */
  | { kind: "immunity"; durationMs: number; area: AreaDef; affects?: Affects };

export interface AbilityDef {
  name: string;
  description: string;
  target: TargetRule;
  /** Temps pendant lequel l'unité ne fait rien d'autre après avoir lancé son sort. */
  castTimeMs: number;
  effects: readonly EffectDef[];
}

interface TriggerBase {
  target: TargetRule;
  effects: readonly EffectDef[];
  /** Nombre maximum de déclenchements par combat (illimité si absent). */
  limit?: number;
}

export type TriggerDef = TriggerBase &
  (
    | { on: "combatStart" }
    | { on: "everyNAttacks"; n: number }
    | { on: "onCast" }
    | { on: "onAllyDeath" }
    | { on: "interval"; everyMs: number }
    /** Après un coup critique. */
    | { on: "onCrit" }
    /** Quand l'unité achève un ennemi. */
    | { on: "onKill" }
    /** Quand l'unité subit des dégâts (bouclier compris), au plus une fois par `cooldownMs`. */
    | { on: "onDamageTaken"; cooldownMs: number }
    /** Une seule fois par combat, quand les PV passent sous `percent` % des PV max. */
    | { on: "hpBelow"; percent: number }
  );

export interface UnitDef {
  id: string;
  name: string;
  cost: 1 | 2 | 3 | 4 | 5;
  traits: readonly string[];
  stats: Stats;
  ability: AbilityDef;
  /** Effets passifs propres à l'unité (ex. : saut des assassins en début de combat). */
  passives?: readonly TriggerDef[];
}

export interface TraitBreakpoint {
  count: number;
  /** "members" : seulement les unités qui ont la synergie. "team" : toute l'équipe. */
  scope: "members" | "team";
  stats?: StatBonus;
  triggers?: readonly TriggerDef[];
}

export interface TraitDef {
  id: string;
  name: string;
  kind: "origin" | "class";
  description: string;
  /** Triés par `count` croissant ; seul le palier atteint le plus haut s'applique. */
  breakpoints: readonly TraitBreakpoint[];
}

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  stats: StatBonus;
  triggers?: readonly TriggerDef[];
  /** Les deux composants qui forment cet objet (absent = composant de base). */
  components?: readonly [string, string];
}

/** Ce que le serveur envoie à la simulation : une unité posée sur le plateau d'un joueur. */
export interface Placement {
  defId: string;
  star: StarLevel;
  /** Case sur le plateau du joueur (rangées 0..3). */
  hex: Hex;
  items?: readonly string[];
}

export interface Content {
  units: ReadonlyMap<string, UnitDef>;
  traits: ReadonlyMap<string, TraitDef>;
  items: ReadonlyMap<string, ItemDef>;
}

/** Bonus appliqué à une équipe entière ou à une partie de ses unités (présages, augments…). */
export interface Modifier {
  /** Unités concernées ; toutes si absent. Une unité est concernée si elle a l'une des
   * synergies OU l'un des coûts listés. */
  filter?: { traits?: readonly string[]; costs?: readonly number[] };
  stats?: StatBonus;
  triggers?: readonly TriggerDef[];
}

export interface BattleInput {
  seed: number;
  boards: readonly [readonly Placement[], readonly Placement[]];
  content: Content;
  modifiers?: readonly [readonly Modifier[], readonly Modifier[]];
}

/** Temps `t` en millisecondes depuis le début du combat. */
export type BattleEvent =
  | {
      t: number;
      type: "spawn";
      unit: number;
      team: Team;
      defId: string;
      star: StarLevel;
      hex: Hex;
      maxHp: number;
      mana: number;
      maxMana: number;
    }
  | { t: number; type: "traits"; team: Team; active: Record<string, number> }
  | { t: number; type: "move"; unit: number; from: Hex; to: Hex; durationMs: number }
  | { t: number; type: "attack"; unit: number; target: number; crit: boolean; mana: number }
  | {
      t: number;
      type: "damage";
      source: number;
      target: number;
      amount: number;
      shieldAbsorbed: number;
      damageType: DamageType;
      hp: number;
      mana: number;
    }
  | { t: number; type: "cast"; unit: number; ability: string; target: number }
  | { t: number; type: "heal"; source: number; target: number; amount: number; hp: number }
  | { t: number; type: "shield"; source: number; target: number; amount: number; durationMs: number }
  | { t: number; type: "stun"; source: number; target: number; durationMs: number }
  /** `amount` négatif = malus (ex. : vitesse d'attaque réduite par un objet ennemi). */
  | { t: number; type: "buff"; source: number; target: number; stat: StatKey; amount: number; durationMs?: number }
  /** Brûlure posée (ou rafraîchie) ; chaque seconde, un événement "damage" de type "true" suit. */
  | { t: number; type: "burn"; source: number; target: number; percentMaxHp: number; durationMs: number }
  /** Blessure : soins reçus réduits de `percent` %. */
  | { t: number; type: "wound"; source: number; target: number; percent: number; durationMs: number }
  /** Armure ou résistance magique réduite de `percent` %. */
  | { t: number; type: "sunder"; source: number; target: number; stat: ResistKey; percent: number; durationMs: number }
  /** Immunité aux étourdissements. */
  | { t: number; type: "immunity"; source: number; target: number; durationMs: number }
  | { t: number; type: "death"; unit: number; killer: number }
  | { t: number; type: "end"; winner: Team | null; survivors: number[] };

export interface SurvivorInfo {
  unit: number;
  team: Team;
  defId: string;
  star: StarLevel;
  hp: number;
}

export interface BattleResult {
  /** null = temps écoulé avec des survivants des deux côtés. */
  winner: Team | null;
  durationMs: number;
  survivors: SurvivorInfo[];
  events: BattleEvent[];
}
