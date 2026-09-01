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
  addSpectatorChatMessage,
  SPECTATOR_CHAT_MAX_LENGTH,
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

describe("spectator chat", () => {
  it("rejects a message from someone not currently spectating", () => {
    const room = createRoom({ maxPlayers: 2 });
    expect(addSpectatorChatMessage(room, "not-a-spectator", "hi").error).toBeTruthy();
    expect(room.spectatorChat).toHaveLength(0);
  });

  it("trims and appends a message, attributing it to the spectator's own name", () => {
    const room = createRoom({ maxPlayers: 2 });
    const { spectator } = addSpectator(room, { name: "Watcher", userId: "user-1", deviceId: null, socketId: "s1" });

    const { message } = addSpectatorChatMessage(room, spectator.id, "  hello everyone  ", 1000);
    expect(message.text).toBe("hello everyone");
    expect(message.fromId).toBe(spectator.id);
    expect(message.fromName).toBe("Watcher");
    expect(room.spectatorChat).toEqual([message]);
  });

  it("rejects an empty message (including one that's all whitespace)", () => {
    const room = createRoom({ maxPlayers: 2 });
    const { spectator } = addSpectator(room, { name: "Watcher", userId: "user-1", deviceId: null, socketId: "s1" });

    expect(addSpectatorChatMessage(room, spectator.id, "   ", 1000).error).toBeTruthy();
    expect(addSpectatorChatMessage(room, spectator.id, "", 1000).error).toBeTruthy();
    expect(room.spectatorChat).toHaveLength(0);
  });

  it("rejects a message over the max length", () => {
    const room = createRoom({ maxPlayers: 2 });
    const { spectator } = addSpectator(room, { name: "Watcher", userId: "user-1", deviceId: null, socketId: "s1" });

    const tooLong = "a".repeat(SPECTATOR_CHAT_MAX_LENGTH + 1);
    const { error } = addSpectatorChatMessage(room, spectator.id, tooLong, 1000);
    expect(error).toBeTruthy();
    expect(room.spectatorChat).toHaveLength(0);

    const exactlyMax = "a".repeat(SPECTATOR_CHAT_MAX_LENGTH);
    expect(addSpectatorChatMessage(room, spectator.id, exactlyMax, 1000).message).toBeTruthy();
  });

  it("rate-limits messages sent too soon after the same spectator's last one", () => {
    const room = createRoom({ maxPlayers: 2 });
    const { spectator } = addSpectator(room, { name: "Watcher", userId: "user-1", deviceId: null, socketId: "s1" });

    expect(addSpectatorChatMessage(room, spectator.id, "first", 1000).message).toBeTruthy();
    expect(addSpectatorChatMessage(room, spectator.id, "too soon", 1100).error).toBeTruthy();
    expect(addSpectatorChatMessage(room, spectator.id, "later", 5000).message).toBeTruthy();
    expect(room.spectatorChat.map((m) => m.text)).toEqual(["first", "later"]);
  });

  it("doesn't let one spectator's rate limit block another's message", () => {
    const room = createRoom({ maxPlayers: 2 });
    const { spectator: a } = addSpectator(room, { name: "A", userId: "user-a", deviceId: null, socketId: "s1" });
    const { spectator: b } = addSpectator(room, { name: "B", userId: "user-b", deviceId: null, socketId: "s2" });

    expect(addSpectatorChatMessage(room, a.id, "hi", 1000).message).toBeTruthy();
    expect(addSpectatorChatMessage(room, b.id, "hey", 1050).message).toBeTruthy();
  });

  it("bounds the backlog to the most recent 50 messages", () => {
    const room = createRoom({ maxPlayers: 2 });
    const { spectator } = addSpectator(room, { name: "Watcher", userId: "user-1", deviceId: null, socketId: "s1" });

    for (let i = 0; i < 55; i++) {
      addSpectatorChatMessage(room, spectator.id, `msg-${i}`, 1000 + i * 2000);
    }
    expect(room.spectatorChat).toHaveLength(50);
    expect(room.spectatorChat[0].text).toBe("msg-5");
    expect(room.spectatorChat.at(-1).text).toBe("msg-54");
  });
});
