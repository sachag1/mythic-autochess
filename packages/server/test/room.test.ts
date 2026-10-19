import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { server } from "../src/server.js";
import type { GameRoom } from "../src/room/GameRoom.js";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(server, 2588);
});
afterAll(async () => {
  await colyseus.shutdown();
});
afterEach(async () => {
  await colyseus.cleanup();
});

describe("game room", () => {
  it("fills the lobby with bots when the host starts the game", async () => {
    const room = await colyseus.createRoom<GameRoom>("game", { seed: 3 });
    const alice = await colyseus.connectTo(room, { name: "Alice" });
    await colyseus.connectTo(room, { name: "Bob" });
    expect(room.state.hostId).toBe(alice.sessionId);

    alice.send("start");
    await room.waitForNextMessage();
    await alice.waitForNextPatch();

    expect(room.game).not.toBeNull();
    expect(room.state.players.size).toBe(8);
    expect(room.state.phase).toBe("omen");
    expect(alice.state.omenChoices.length).toBe(3);
    expect([...alice.state.players.values()].filter((p) => p.isBot).length).toBe(6);
  });

  it("sends a player's shop to that player only", async () => {
    const room = await colyseus.createRoom<GameRoom>("game", { seed: 4 });
    const alice = await colyseus.connectTo(room, { name: "Alice" });
    const bob = await colyseus.connectTo(room, { name: "Bob" });
    alice.send("start");
    await room.waitForNextMessage();

    // Passe le vote et l'armurerie pour arriver à la première boutique.
    for (let i = 0; i < 20 && room.game!.phase !== "planning"; i++) room.game!.skipPhase();
    await alice.waitForNextPatch();
    await bob.waitForNextPatch();

    const aliceSeesOwnShop = alice.state.players.get(alice.sessionId)!.shop;
    const bobSeesAliceShop = bob.state.players.get(alice.sessionId)!.shop;
    expect(aliceSeesOwnShop.length).toBe(5);
    expect(bobSeesAliceShop?.length ?? 0).toBe(0);
  });

  it("applies actions sent by a client and reports errors", async () => {
    const room = await colyseus.createRoom<GameRoom>("game", { seed: 5 });
    const alice = await colyseus.connectTo(room, { name: "Alice" });
    alice.send("start");
    await room.waitForNextMessage();
    for (let i = 0; i < 20 && room.game!.phase !== "planning"; i++) room.game!.skipPhase();

    const me = room.game!.players.get(alice.sessionId)!;
    me.gold = 10;
    alice.send("buyXp");
    await room.waitForNextMessage();
    expect(me.gold).toBe(6);

    me.gold = 0;
    alice.send("reroll");
    const error = await alice.waitForMessage("error");
    expect(error).toMatchObject({ action: "reroll", error: "Not enough gold" });
  });

  it("delivers battle reports to the player", async () => {
    const room = await colyseus.createRoom<GameRoom>("game", { seed: 6 });
    const alice = await colyseus.connectTo(room, { name: "Alice" });
    alice.send("start");
    await room.waitForNextMessage();
    const battle = alice.waitForMessage("battle");
    for (let i = 0; i < 20 && room.game!.phase !== "combat"; i++) room.game!.skipPhase();
    const report = await battle;
    expect(report.playerId).toBe(alice.sessionId);
    expect(report.events.at(-1).type).toBe("end");
  });
});
