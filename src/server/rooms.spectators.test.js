import { describe, it, expect } from "vitest";
import {
  createRoom,
  addSeats,
  startGame,
  addSpectator,
  reconnectSpectator,
  setSpectatePolicy,
  handleSocketDisconnect,
  serializeRoom,
} from "./rooms.js";

function makeStartedRoom(n) {
  const room = createRoom({ maxPlayers: n });
  for (let i = 0; i < n; i++) {
    addSeats(room, [{ name: `P${i}`, profileId: `profile-${i}` }], {
      socketId: `socket-${i}`,
      deviceId: `device-${i}`,
      userId: `user-${i}`,
    });
  }
  startGame(room);
  return { room };
}

describe("spectators", () => {
  it("defaults a new room to private with nobody watching", () => {
    const room = createRoom({ maxPlayers: 2 });
    expect(room.spectatePolicy).toBe("private");
    expect(serializeRoom(room).spectatorCount).toBe(0);
  });

  it("adds a new spectator and reconnects the same identity instead of duplicating", () => {
    const room = createRoom({ maxPlayers: 2 });
    const { spectator } = addSpectator(room, { name: "Watcher", userId: "user-1", deviceId: null, socketId: "s1" });
    expect(room.spectators).toHaveLength(1);

    const { spectator: again } = addSpectator(room, { name: "Watcher", userId: "user-1", deviceId: null, socketId: "s2" });
    expect(room.spectators).toHaveLength(1);
    expect(again.id).toBe(spectator.id);
    expect(again.socketId).toBe("s2");
  });

  it("reconnects a mid-game spectator by token after a disconnect", () => {
    // Mid-game, not the lobby: a lobby disconnect drops a spectator outright
    // (see the next test) — nothing left to reconnect to by token there.
    const { room } = makeStartedRoom(2);
    const { spectator } = addSpectator(room, { name: "Watcher", userId: null, deviceId: "device-1", socketId: "s1" });
    handleSocketDisconnect(room, "s1", () => {});
    expect(room.spectators.find((s) => s.id === spectator.id).connected).toBe(false);

    const reconnected = reconnectSpectator(room, [spectator.token], "s2", null);
    expect(reconnected.id).toBe(spectator.id);
    expect(reconnected.connected).toBe(true);
    expect(reconnected.socketId).toBe("s2");
  });

  it("drops a lobby spectator outright on disconnect, but only marks a mid-game one disconnected", () => {
    const lobbyRoom = createRoom({ maxPlayers: 2 });
    addSpectator(lobbyRoom, { name: "W", userId: null, deviceId: "d1", socketId: "s1" });
    handleSocketDisconnect(lobbyRoom, "s1", () => {});
    expect(lobbyRoom.spectators).toHaveLength(0);

    const { room: midGameRoom } = makeStartedRoom(2);
    addSpectator(midGameRoom, { name: "W", userId: null, deviceId: "d1", socketId: "s1" });
    handleSocketDisconnect(midGameRoom, "s1", () => {});
    expect(midGameRoom.spectators).toHaveLength(1);
    expect(midGameRoom.spectators[0].connected).toBe(false);
    expect(serializeRoom(midGameRoom).spectatorCount).toBe(0);
  });

  it("toggles the room's spectate policy, rejecting an invalid value", () => {
    const room = createRoom({ maxPlayers: 2 });
    expect(setSpectatePolicy(room, "public").room.spectatePolicy).toBe("public");
    expect(setSpectatePolicy(room, "not-a-policy").error).toBeTruthy();
  });
});
