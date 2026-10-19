// État synchronisé vers les clients (encodage binaire, seules les différences sont envoyées).
import { schema, t, type SchemaType } from "@colyseus/schema";

export const UnitState = schema(
  {
    uid: t.string(),
    defId: t.string(),
    star: t.uint8(),
    items: t.array("string"),
  },
  "UnitState",
);
export type UnitState = SchemaType<typeof UnitState>;

export const PlayerSchema = schema(
  {
    id: t.string(),
    name: t.string(),
    isBot: t.boolean(),
    connected: t.boolean(),
    hp: t.int16(),
    gold: t.uint16(),
    level: t.uint8(),
    xp: t.uint16(),
    xpToNext: t.uint16(),
    streak: t.int8(),
    alive: t.boolean(),
    /** 0 tant que le joueur est en vie. */
    placement: t.uint8(),
    /** Boutique privée : seul le joueur concerné la reçoit. "" = case vide. */
    shop: t.array("string").view(),
    shopLocked: t.boolean().view(),
    freeRerolls: t.uint8().view(),
    /** Clé = index de la case du banc. */
    bench: t.map(UnitState),
    /** Clé = "col,row" sur la moitié du plateau du joueur. */
    board: t.map(UnitState),
    items: t.array("string"),
    omenVote: t.string(),
    lastResult: t.string(),
  },
  "PlayerSchema",
);
export type PlayerSchema = SchemaType<typeof PlayerSchema>;

export const ArmoryOfferSchema = schema(
  {
    defId: t.string(),
    item: t.string(),
    takenBy: t.string(),
  },
  "ArmoryOfferSchema",
);
export type ArmoryOfferSchema = SchemaType<typeof ArmoryOfferSchema>;

export const GameStateSchema = schema(
  {
    /** "lobby", puis les phases de la partie : omen, armory, planning, combat, ended. */
    phase: t.string().default("lobby"),
    stage: t.uint8(),
    round: t.uint8(),
    /** Fin de la phase en cours (horodatage serveur en ms). */
    phaseEndsAt: t.float64(),
    hostId: t.string(),
    omenChoices: t.array("string"),
    omen: t.string(),
    omenDetail: t.string(),
    players: t.map(PlayerSchema),
    armory: t.array(ArmoryOfferSchema),
    armoryPicker: t.string(),
  },
  "GameStateSchema",
);
export type GameStateSchema = SchemaType<typeof GameStateSchema>;
