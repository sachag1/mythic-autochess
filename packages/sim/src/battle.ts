import { HALF_ROWS, hexDistance, hexKey, mirrorHex, neighbors, nextStepToward, sameHex, type Hex } from "./hex.js";
import { Rng } from "./rng.js";
import { addStats, baseStatsFor, mitigationMultiplier } from "./stats.js";
import { activeTraits } from "./traits.js";
import type {
  Affects,
  AreaDef,
  BattleEvent,
  BattleInput,
  BattleResult,
  DamageType,
  EffectDef,
  Scaling,
  StarLevel,
  StarValues,
  StatKey,
  Stats,
  Team,
  TargetRule,
  TriggerDef,
  UnitDef,
} from "./types.js";

export const TICK_MS = 50;
export const MAX_BATTLE_MS = 45_000;
/** Temps pour avancer d'une case. */
export const MOVE_MS = 350;
export const LEAP_MS = 400;
export const MANA_PER_ATTACK = 10;
/** Mana gagnée en recevant des dégâts : 1 % des dégâts bruts + 7 % des dégâts subis, plafonnée. */
const MANA_FROM_RAW = 0.01;
const MANA_FROM_TAKEN = 0.07;
const MANA_FROM_DAMAGE_CAP = 42.5;
const MAX_DURABILITY = 80;

interface TimedBuff {
  stat: StatKey;
  amount: number;
  expiresAt: number;
}

interface Shield {
  amount: number;
  expiresAt: number;
}

interface IntervalTrigger {
  trigger: Extract<TriggerDef, { on: "interval" }>;
  nextAt: number;
}

interface Unit {
  id: number;
  team: Team;
  def: UnitDef;
  star: StarLevel;
  hex: Hex;
  /** Stats permanentes : base × étoiles + synergies + objets + bonus permanents. */
  stats: Stats;
  timedBuffs: TimedBuff[];
  shields: Shield[];
  hp: number;
  mana: number;
  alive: boolean;
  targetId: number | null;
  attackReadyAt: number;
  busyUntil: number;
  stunnedUntil: number;
  attackCount: number;
  triggers: TriggerDef[];
  intervals: IntervalTrigger[];
}

export function runBattle(input: BattleInput): BattleResult {
  return new Battle(input).run();
}

class Battle {
  private t = 0;
  private readonly units: Unit[] = [];
  private readonly rng: Rng;
  private readonly events: BattleEvent[] = [];

  constructor(private readonly input: BattleInput) {
    this.rng = new Rng(input.seed);
    this.spawnUnits();
  }

  run(): BattleResult {
    for (const unit of this.units) this.fireTriggers(unit, "combatStart");

    while (true) {
      for (const unit of this.units) {
        if (unit.alive) this.step(unit);
      }
      if (!this.teamAlive(0) || !this.teamAlive(1)) break;
      this.t += TICK_MS;
      if (this.t > MAX_BATTLE_MS) break;
    }

    const alive0 = this.teamAlive(0);
    const alive1 = this.teamAlive(1);
    const winner: Team | null = alive0 && !alive1 ? 0 : alive1 && !alive0 ? 1 : null;
    const survivors = this.units.filter((u) => u.alive);
    this.emit({ type: "end", winner, survivors: survivors.map((u) => u.id) });
    return {
      winner,
      durationMs: this.t,
      survivors: survivors.map((u) => ({
        unit: u.id,
        team: u.team,
        defId: u.def.id,
        star: u.star,
        hp: Math.round(u.hp),
      })),
      events: this.events,
    };
  }

  // ---------------------------------------------------------------- mise en place

  private spawnUnits(): void {
    const { boards, content } = this.input;
    const occupied = new Set<number>();

    boards.forEach((board, teamIndex) => {
      const team = teamIndex as Team;
      for (const placement of board) {
        const def = content.units.get(placement.defId);
        if (!def) throw new Error(`Unknown unit "${placement.defId}"`);
        if (placement.hex.row < 0 || placement.hex.row >= HALF_ROWS) {
          throw new Error(`Unit "${placement.defId}" is outside its half of the board`);
        }
        const hex = team === 0 ? placement.hex : mirrorHex(placement.hex);
        const key = hexKey(hex);
        if (occupied.has(key)) throw new Error(`Two units on the same hex (${hex.col}, ${hex.row})`);
        occupied.add(key);

        const unit: Unit = {
          id: this.units.length,
          team,
          def,
          star: placement.star,
          hex,
          stats: baseStatsFor(def, placement.star),
          timedBuffs: [],
          shields: [],
          hp: 0,
          mana: 0,
          alive: true,
          targetId: null,
          attackReadyAt: 0,
          busyUntil: 0,
          stunnedUntil: 0,
          attackCount: 0,
          triggers: [],
          intervals: [],
        };
        unit.triggers.push(...(def.passives ?? []));
        for (const itemId of placement.items ?? []) {
          const item = content.items.get(itemId);
          if (!item) throw new Error(`Unknown item "${itemId}"`);
          addStats(unit.stats, item.stats);
          unit.triggers.push(...(item.triggers ?? []));
        }
        this.units.push(unit);
      }
    });

    for (const team of [0, 1] as const) {
      const members = this.units.filter((u) => u.team === team);
      const active = activeTraits(members.map((u) => u.def), content.traits);
      for (const { trait, breakpoint } of active) {
        const recipients =
          breakpoint.scope === "team" ? members : members.filter((u) => u.def.traits.includes(trait.id));
        for (const unit of recipients) {
          if (breakpoint.stats) addStats(unit.stats, breakpoint.stats);
          unit.triggers.push(...(breakpoint.triggers ?? []));
        }
      }
      this.emit({
        type: "traits",
        team,
        active: Object.fromEntries(active.map((a) => [a.trait.id, a.count])),
      });
    }

    for (const unit of this.units) {
      unit.hp = unit.stats.maxHp;
      unit.mana = Math.min(unit.stats.startMana, unit.stats.maxMana);
      for (const trigger of unit.triggers) {
        if (trigger.on === "interval") unit.intervals.push({ trigger, nextAt: trigger.everyMs });
      }
      this.emit({
        type: "spawn",
        unit: unit.id,
        team: unit.team,
        defId: unit.def.id,
        star: unit.star,
        hex: unit.hex,
        maxHp: Math.round(unit.stats.maxHp),
        mana: unit.mana,
        maxMana: unit.stats.maxMana,
      });
    }
  }

  // ---------------------------------------------------------------- tour d'une unité

  private step(unit: Unit): void {
    for (const interval of unit.intervals) {
      if (this.t >= interval.nextAt) {
        interval.nextAt += interval.trigger.everyMs;
        this.runTrigger(unit, interval.trigger);
        if (!unit.alive) return;
      }
    }
    if (this.t < unit.stunnedUntil || this.t < unit.busyUntil) return;

    const target = this.acquireTarget(unit);
    if (!target) return;
    const inRange = hexDistance(unit.hex, target.hex) <= this.stat(unit, "range");

    const ability = unit.def.ability;
    if (unit.mana >= this.stat(unit, "maxMana") && (ability.target !== "currentTarget" || inRange)) {
      this.cast(unit);
      return;
    }

    if (inRange) {
      if (this.t >= unit.attackReadyAt) this.attack(unit, target);
    } else {
      this.move(unit, target);
    }
  }

  private acquireTarget(unit: Unit): Unit | null {
    const range = this.stat(unit, "range");
    const current = unit.targetId === null ? undefined : this.units[unit.targetId];
    if (current?.alive && hexDistance(unit.hex, current.hex) <= range) return current;

    const enemies = this.enemiesOf(unit).sort(
      (a, b) => hexDistance(unit.hex, a.hex) - hexDistance(unit.hex, b.hex) || a.id - b.id,
    );
    const nearest = enemies[0];
    if (!nearest) return null;
    // On garde la cible actuelle si elle est aussi proche que la plus proche.
    const chosen =
      current?.alive && hexDistance(unit.hex, current.hex) === hexDistance(unit.hex, nearest.hex)
        ? current
        : nearest;
    unit.targetId = chosen.id;
    return chosen;
  }

  private move(unit: Unit, target: Unit): void {
    const range = this.stat(unit, "range");
    const blocked = (hex: Hex) => this.units.some((u) => u.alive && u !== unit && sameHex(u.hex, hex));

    let step = nextStepToward(unit.hex, target.hex, range, blocked);
    if (!step) {
      // Cible inaccessible (entourée) : on se rabat sur l'ennemi atteignable le plus proche.
      const others = this.enemiesOf(unit)
        .filter((e) => e !== target)
        .sort((a, b) => hexDistance(unit.hex, a.hex) - hexDistance(unit.hex, b.hex) || a.id - b.id);
      for (const other of others) {
        step = nextStepToward(unit.hex, other.hex, range, blocked);
        if (step) {
          unit.targetId = other.id;
          break;
        }
      }
    }
    if (!step) return;

    const from = unit.hex;
    unit.hex = step;
    unit.busyUntil = this.t + MOVE_MS;
    this.emit({ type: "move", unit: unit.id, from, to: step, durationMs: MOVE_MS });
  }

  private attack(unit: Unit, target: Unit): void {
    const crit = this.rng.chance(this.stat(unit, "critChance"));
    const damage = this.stat(unit, "attackDamage") * (crit ? this.stat(unit, "critDamage") : 1);
    unit.attackCount++;
    this.gainMana(unit, MANA_PER_ATTACK);
    unit.attackReadyAt = this.t + 1000 / this.attackSpeed(unit);
    this.emit({ type: "attack", unit: unit.id, target: target.id, crit, mana: unit.mana });
    this.dealDamage(unit, target, damage, "physical");

    for (const trigger of unit.triggers) {
      if (trigger.on === "everyNAttacks" && unit.attackCount % trigger.n === 0) this.runTrigger(unit, trigger);
    }
  }

  private cast(unit: Unit): void {
    const ability = unit.def.ability;
    const center = this.resolveTarget(unit, ability.target);
    if (!center) return;
    unit.mana = 0;
    unit.busyUntil = this.t + ability.castTimeMs;
    this.emit({ type: "cast", unit: unit.id, ability: ability.name, target: center.id });
    this.applyEffects(unit, ability.effects, center);
    this.fireTriggers(unit, "onCast");
  }

  // ---------------------------------------------------------------- effets

  private fireTriggers(unit: Unit, on: TriggerDef["on"]): void {
    for (const trigger of unit.triggers) {
      if (trigger.on === on) this.runTrigger(unit, trigger);
    }
  }

  private runTrigger(unit: Unit, trigger: TriggerDef): void {
    if (!unit.alive) return;
    const center = this.resolveTarget(unit, trigger.target);
    if (center) this.applyEffects(unit, trigger.effects, center);
  }

  private resolveTarget(unit: Unit, rule: TargetRule): Unit | null {
    switch (rule) {
      case "self":
        return unit;
      case "currentTarget":
        return this.acquireTarget(unit);
      case "lowestHpAlly":
        return pick(this.alliesOf(unit), (a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp);
      case "farthestEnemy":
        return pick(this.enemiesOf(unit), (a, b) => hexDistance(unit.hex, b.hex) - hexDistance(unit.hex, a.hex));
      case "highestHpEnemy":
        return pick(this.enemiesOf(unit), (a, b) => b.hp - a.hp);
    }
  }

  private applyEffects(source: Unit, effects: readonly EffectDef[], center: Unit): void {
    for (const effect of effects) {
      if (effect.kind === "leap") {
        this.leap(source, center);
        continue;
      }
      const affects: Affects = effect.kind === "damage" || effect.kind === "stun" ? "enemies" : (effect.affects ?? "allies");
      for (const target of this.areaRecipients(source, center, effect.area, affects)) {
        this.applyEffect(source, effect, target);
      }
    }
  }

  private areaRecipients(source: Unit, center: Unit, area: AreaDef, affects: Affects): Unit[] {
    const pool = affects === "enemies" ? this.enemiesOf(source) : this.alliesOf(source);
    switch (area.shape) {
      case "self":
        return [source];
      case "single":
        return pool.includes(center) ? [center] : [];
      case "radius":
        return pool.filter((u) => hexDistance(u.hex, center.hex) <= area.radius);
      case "all":
        return pool;
    }
  }

  private leap(unit: Unit, target: Unit): void {
    if (!unit.alive || !target.alive || unit === target) return;
    const free = neighbors(target.hex).find((hex) => !this.units.some((u) => u.alive && sameHex(u.hex, hex)));
    if (!free) return;
    const from = unit.hex;
    unit.hex = free;
    unit.targetId = target.id;
    unit.busyUntil = Math.max(unit.busyUntil, this.t + LEAP_MS);
    this.emit({ type: "move", unit: unit.id, from, to: free, durationMs: LEAP_MS });
  }

  private applyEffect(source: Unit, effect: EffectDef, target: Unit): void {
    if (!target.alive) return;
    switch (effect.kind) {
      case "leap":
        return;
      case "damage":
        this.dealDamage(source, target, this.amount(source, effect.amount, effect.scaling), effect.damageType);
        return;
      case "heal":
        this.heal(source, target, this.amount(source, effect.amount, effect.scaling));
        return;
      case "shield": {
        const amount = this.amount(source, effect.amount, effect.scaling);
        target.shields.push({ amount, expiresAt: this.t + effect.durationMs });
        this.emit({
          type: "shield",
          source: source.id,
          target: target.id,
          amount: Math.round(amount),
          durationMs: effect.durationMs,
        });
        return;
      }
      case "stun": {
        const durationMs = starValue(effect.durationMs, source.star);
        target.stunnedUntil = Math.max(target.stunnedUntil, this.t + durationMs);
        this.emit({ type: "stun", source: source.id, target: target.id, durationMs });
        return;
      }
      case "mana":
        this.gainMana(target, starValue(effect.amount, source.star));
        return;
      case "buff": {
        const amount = starValue(effect.amount, source.star);
        if (effect.durationMs === undefined) {
          target.stats[effect.stat] += amount;
          if (effect.stat === "maxHp") target.hp += amount;
        } else {
          target.timedBuffs.push({ stat: effect.stat, amount, expiresAt: this.t + effect.durationMs });
        }
        this.emit({
          type: "buff",
          source: source.id,
          target: target.id,
          stat: effect.stat,
          amount,
          ...(effect.durationMs === undefined ? {} : { durationMs: effect.durationMs }),
        });
        return;
      }
    }
  }

  private dealDamage(source: Unit, target: Unit, raw: number, damageType: DamageType): void {
    if (!target.alive || raw <= 0) return;
    const amplified = raw * (1 + this.stat(source, "damageAmp") / 100);
    const mitigation =
      damageType === "physical"
        ? mitigationMultiplier(this.stat(target, "armor"))
        : damageType === "magic"
          ? mitigationMultiplier(this.stat(target, "magicResist"))
          : 1;
    const durability = Math.min(this.stat(target, "durability"), MAX_DURABILITY) / 100;
    const taken = amplified * mitigation * (1 - durability);

    let remaining = taken;
    let absorbed = 0;
    for (const shield of target.shields) {
      if (shield.expiresAt <= this.t || remaining <= 0) continue;
      const used = Math.min(shield.amount, remaining);
      shield.amount -= used;
      remaining -= used;
      absorbed += used;
    }
    target.shields = target.shields.filter((s) => s.amount > 0 && s.expiresAt > this.t);
    target.hp -= remaining;
    this.gainMana(target, Math.min(MANA_FROM_DAMAGE_CAP, raw * MANA_FROM_RAW + taken * MANA_FROM_TAKEN));

    this.emit({
      type: "damage",
      source: source.id,
      target: target.id,
      amount: Math.round(remaining),
      shieldAbsorbed: Math.round(absorbed),
      damageType,
      hp: Math.max(0, Math.round(target.hp)),
      mana: Math.round(target.mana),
    });

    const vamp = this.stat(source, "omnivamp");
    if (vamp > 0 && source.alive) this.heal(source, source, (taken * vamp) / 100);

    if (target.hp <= 0) this.kill(target, source);
  }

  private heal(source: Unit, target: Unit, amount: number): void {
    if (!target.alive) return;
    const healed = Math.min(amount, this.stat(target, "maxHp") - target.hp);
    if (healed <= 0) return;
    target.hp += healed;
    this.emit({ type: "heal", source: source.id, target: target.id, amount: Math.round(healed), hp: Math.round(target.hp) });
  }

  private kill(unit: Unit, killer: Unit): void {
    unit.alive = false;
    unit.hp = 0;
    this.emit({ type: "death", unit: unit.id, killer: killer.id });
    for (const ally of this.alliesOf(unit)) this.fireTriggers(ally, "onAllyDeath");
  }

  // ---------------------------------------------------------------- utilitaires

  private gainMana(unit: Unit, amount: number): void {
    unit.mana = Math.min(this.stat(unit, "maxMana"), unit.mana + amount);
  }

  private stat(unit: Unit, key: StatKey): number {
    let value = unit.stats[key];
    for (const buff of unit.timedBuffs) {
      if (buff.stat === key && buff.expiresAt > this.t) value += buff.amount;
    }
    return value;
  }

  private attackSpeed(unit: Unit): number {
    const value = this.stat(unit, "attackSpeed") * (1 + this.stat(unit, "attackSpeedPct") / 100);
    return Math.min(Math.max(value, 0.2), 5);
  }

  private amount(source: Unit, values: StarValues, scaling: Scaling): number {
    const base = starValue(values, source.star);
    if (scaling === "ap") return (base * this.stat(source, "abilityPower")) / 100;
    if (scaling === "ad") return base * this.stat(source, "attackDamage");
    return base;
  }

  private enemiesOf(unit: Unit): Unit[] {
    return this.units.filter((u) => u.alive && u.team !== unit.team);
  }

  private alliesOf(unit: Unit): Unit[] {
    return this.units.filter((u) => u.alive && u.team === unit.team);
  }

  private teamAlive(team: Team): boolean {
    return this.units.some((u) => u.alive && u.team === team);
  }

  private emit(event: DistributiveOmit<BattleEvent, "t">): void {
    this.events.push({ t: this.t, ...event } as BattleEvent);
  }
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

function starValue(values: StarValues, star: StarLevel): number {
  return values[star - 1]!;
}

/** Premier élément selon `compare`, à égalité le plus petit id (déterministe). */
function pick(units: Unit[], compare: (a: Unit, b: Unit) => number): Unit | null {
  return units.sort((a, b) => compare(a, b) || a.id - b.id)[0] ?? null;
}
