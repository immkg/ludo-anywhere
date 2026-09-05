import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createRoom,
  addSeats,
  startGame,
  handleSocketDisconnect,
  toPersistedRoom,
  restoreRoom,
  resumeDisconnectGrace,
  getRoom,
  reconnectSeats,
} from "./rooms.js";

function makeStartedRoom(n) {
  const room = createRoom({ maxPlayers: n });
  const seats = [];
  for (let i = 0; i < n; i++) {
    const { seats: added } = addSeats(room, [{ name: `P${i}`, profileId: `profile-${i}` }], {
      socketId: `socket-${i}`,
      deviceId: `device-${i}`,
      userId: `user-${i}`,
    });
    seats.push(added[0]);
  }
  startGame(room);
  return { room, seats };
}

// Round-trips a room through JSON the same way Redis storage would (see
// roomStore.js), rather than just calling restoreRoom directly on the live
// object — that would trivially work even if a field weren't actually
// JSON-serializable.
function roundTrip(room) {
  return restoreRoom(JSON.parse(JSON.stringify(toPersistedRoom(room))));
}

describe("room persistence (toPersistedRoom / restoreRoom)", () => {
  it("round-trips a lobby room's seats and Map/Set fields", () => {
    const room = createRoom({ maxPlayers: 4 });
    addSeats(room, [{ name: "Host", profileId: "profile-1" }], {
      socketId: "socket-1",
      deviceId: "device-1",
      userId: "user-1",
    });
    room.invitedUserIds.add("user-99");
    room.pendingRequests.set("user-42", { seats: [{ name: "Guest" }], fromName: "Host" });

    const restored = roundTrip(room);
    expect(restored.code).toBe(room.code);
    expect(restored.status).toBe("lobby");
    expect(restored.seats).toHaveLength(1);
    expect(restored.seats[0].name).toBe("Host");
    expect(restored.invitedUserIds).toBeInstanceOf(Set);
    expect(restored.invitedUserIds.has("user-99")).toBe(true);
    expect(restored.pendingRequests).toBeInstanceOf(Map);
    expect(restored.pendingRequests.get("user-42").fromName).toBe("Host");
    expect(restored.disconnectTimers).toBeInstanceOf(Map);
    expect(restored.disconnectTimers.size).toBe(0);
  });

  it("marks every seat disconnected on restore, but preserves the game state", () => {
    const { room, seats } = makeStartedRoom(2);
    expect(room.seats.every((s) => s.connected)).toBe(true);

    const restored = roundTrip(room);
    expect(restored.status).toBe("playing");
    expect(restored.seats.every((s) => s.connected === false)).toBe(true);
    expect(restored.seats.every((s) => s.socketId === null)).toBe(true);
    expect(restored.seats.every((s) => typeof s.disconnectedAt === "number")).toBe(true);
    expect(restored.game.seats.map((s) => s.id)).toEqual(room.game.seats.map((s) => s.id));
    expect(restored.game.currentSeatIndex).toBe(room.game.currentSeatIndex);

    // Still reconnectable the normal way, by the same seat id (registered
    // into the module's live `rooms` map by restoreRoom itself).
    expect(getRoom(restored.code)).toBe(restored);
    const reconnected = reconnectSeats(restored, [], "new-socket", seats[0].userId);
    expect(reconnected).toHaveLength(1);
    expect(reconnected[0].connected).toBe(true);
  });

  it("preserves an already-disconnected seat's original disconnectedAt", () => {
    const { room, seats } = makeStartedRoom(2);
    handleSocketDisconnect(room, seats[0].socketId, () => {});
    const originalDisconnectedAt = room.seats.find((s) => s.id === seats[0].id).disconnectedAt;
    expect(typeof originalDisconnectedAt).toBe("number");

    const restored = roundTrip(room);
    expect(restored.seats.find((s) => s.id === seats[0].id).disconnectedAt).toBe(originalDisconnectedAt);
  });

  it("startedAt survives the ISO-string round trip as a Date", () => {
    const { room } = makeStartedRoom(2);
    const restored = roundTrip(room);
    expect(restored.startedAt).toBeInstanceOf(Date);
    expect(restored.startedAt.getTime()).toBe(room.startedAt.getTime());
  });
});

describe("resumeDisconnectGrace", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives every disconnected mid-game seat a fresh grace period after restore", () => {
    const { room } = makeStartedRoom(2);
    const restored = roundTrip(room); // every seat comes back connected: false

    const onChange = vi.fn();
    resumeDisconnectGrace(restored, onChange);
    expect(restored.disconnectTimers.size).toBe(2);

    // Not pruned before the grace period elapses.
    vi.advanceTimersByTime(60 * 1000);
    expect(restored.seats).toHaveLength(2);
    expect(onChange).not.toHaveBeenCalled();

    // Pruned once the (full, freshly-armed) grace period elapses.
    vi.advanceTimersByTime(61 * 1000);
    expect(restored.seats.length).toBeLessThan(2);
    expect(onChange).toHaveBeenCalled();
  });

  it("does nothing for a restored lobby room", () => {
    const room = createRoom({ maxPlayers: 2 });
    addSeats(room, [{ name: "Host", profileId: "profile-1" }], {
      socketId: "socket-1",
      deviceId: "device-1",
      userId: "user-1",
    });
    const restored = roundTrip(room);

    const onChange = vi.fn();
    resumeDisconnectGrace(restored, onChange);
    expect(restored.disconnectTimers.size).toBe(0);
  });
});
