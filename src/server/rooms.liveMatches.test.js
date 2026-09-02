import { describe, it, expect } from "vitest";
import { createRoom, addSeats, startGame, setSpectatePolicy, addSpectator, listLiveMatches } from "./rooms.js";

function makePlayingRoom({ maxPlayers = 4, humans = 2, bots = 0 } = {}) {
  const room = createRoom({ maxPlayers });
  for (let i = 0; i < humans; i++) {
    addSeats(room, [{ name: `P${i}`, profileId: `profile-${i}` }], {
      socketId: `socket-${i}`,
      deviceId: `device-${i}`,
      userId: `user-${i}`,
    });
  }
  if (bots > 0) {
    addSeats(
      room,
      Array.from({ length: bots }, (_, i) => ({ name: `Bot ${i + 1}` })),
      { bot: true }
    );
  }
  startGame(room);
  return room;
}

describe("listLiveMatches", () => {
  it("excludes rooms that are still in the lobby", () => {
    const room = createRoom({ maxPlayers: 4 });
    addSeats(room, [{ name: "P0", profileId: "profile-0" }], { socketId: "s0", deviceId: "d0", userId: "u0" });
    setSpectatePolicy(room, "public");
    expect(listLiveMatches().find((m) => m.code === room.code)).toBeUndefined();
  });

  it("excludes finished rooms", () => {
    const room = makePlayingRoom();
    setSpectatePolicy(room, "public");
    room.status = "finished";
    expect(listLiveMatches().find((m) => m.code === room.code)).toBeUndefined();
  });

  it("excludes playing rooms whose host left spectating private (the default)", () => {
    const room = makePlayingRoom();
    expect(room.spectatePolicy).toBe("private");
    expect(listLiveMatches().find((m) => m.code === room.code)).toBeUndefined();
  });

  it("includes a public, in-progress room with human/bot counts and matchmaking flag", () => {
    const room = makePlayingRoom({ humans: 2, bots: 1 });
    room.matchmaking = true;
    setSpectatePolicy(room, "public");

    const match = listLiveMatches().find((m) => m.code === room.code);
    expect(match).toMatchObject({
      code: room.code,
      matchmaking: true,
      maxPlayers: 4,
      humanCount: 2,
      botCount: 1,
      spectatorCount: 0,
      leaderName: null,
    });
    expect(match.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("reflects the connected spectator count", () => {
    const room = makePlayingRoom();
    setSpectatePolicy(room, "public");
    addSpectator(room, { name: "Watcher", userId: "user-9", deviceId: null, socketId: "s9" });

    const match = listLiveMatches().find((m) => m.code === room.code);
    expect(match.spectatorCount).toBe(1);
  });

  it("reports null leaderName before anyone has moved, and a name once one seat pulls ahead", () => {
    const room = makePlayingRoom();
    setSpectatePolicy(room, "public");
    expect(listLiveMatches().find((m) => m.code === room.code).leaderName).toBeNull();

    room.game.seats[0].tokens = [5, -1, -1, -1];
    const match = listLiveMatches().find((m) => m.code === room.code);
    expect(match.leaderName).toBe(room.seats[0].name);
  });

  it("reports null leaderName on a tie", () => {
    const room = makePlayingRoom();
    setSpectatePolicy(room, "public");
    room.game.seats[0].tokens = [5, -1, -1, -1];
    room.game.seats[1].tokens = [5, -1, -1, -1];

    const match = listLiveMatches().find((m) => m.code === room.code);
    expect(match.leaderName).toBeNull();
  });

  it("sorts by spectatorCount desc, then by start order, and respects the limit", () => {
    const quiet = makePlayingRoom();
    setSpectatePolicy(quiet, "public");

    const busy = makePlayingRoom();
    setSpectatePolicy(busy, "public");
    addSpectator(busy, { name: "W1", userId: "u1", deviceId: null, socketId: "s1" });
    addSpectator(busy, { name: "W2", userId: "u2", deviceId: null, socketId: "s2" });

    const matches = listLiveMatches({ limit: 1 });
    expect(matches).toHaveLength(1);
    expect(matches[0].code).toBe(busy.code);
  });
});
