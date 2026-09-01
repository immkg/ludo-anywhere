import { describe, it, expect, vi } from "vitest";
import {
  createRoom,
  addSeats,
  startGame,
  midGameSuspendSeat,
  midGameRemoveSeat,
  midGameAddBot,
  vacatedSeats,
  claimSeat,
  claimableSeats,
  handleSocketDisconnect,
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

describe("mid-game bot fill (midGameAddBot)", () => {
  it("bot-fills a host-paused seat and reactivates it", () => {
    const { room, seats } = makeStartedRoom(3);
    midGameSuspendSeat(room, seats[1].id);
    expect(room.game.seats.find((s) => s.id === seats[1].id).suspended).toBe(true);

    const { room: updated, seat, error } = midGameAddBot(room, seats[1].id);
    expect(error).toBeUndefined();
    expect(seat.bot).toBe(true);
    expect(seat.name).toMatch(/^Bot \d+$/);
    expect(seat.userId).toBeNull();
    expect(updated.game.seats.find((s) => s.id === seats[1].id).suspended).toBe(false);
  });

  it("bot-fills a host-removed, unclaimed seat", () => {
    const { room, seats } = makeStartedRoom(3);
    midGameRemoveSeat(room, seats[1].id);
    expect(claimableSeats(room).some((s) => s.id === seats[1].id)).toBe(true);

    const { seat, error } = midGameAddBot(room, seats[1].id);
    expect(error).toBeUndefined();
    expect(seat.bot).toBe(true);
    expect(room.game.seats.find((s) => s.id === seats[1].id).finished).toBe(false);
  });

  it("bot-fills a disconnected-but-not-yet-pruned seat and clears its grace timer", () => {
    vi.useFakeTimers();
    try {
      const { room, seats } = makeStartedRoom(3);
      handleSocketDisconnect(room, "socket-1", () => {});
      expect(room.seats.find((s) => s.id === seats[1].id).connected).toBe(false);
      expect(room.disconnectTimers.has(seats[1].id)).toBe(true);

      const { seat, error } = midGameAddBot(room, seats[1].id);
      expect(error).toBeUndefined();
      expect(seat.bot).toBe(true);
      expect(seat.connected).toBe(true);
      expect(room.disconnectTimers.has(seats[1].id)).toBe(false);

      // The seat must survive past the original grace period now that a
      // bot (not the disconnect prune) owns it.
      vi.advanceTimersByTime(3 * 60 * 1000);
      expect(room.seats.some((s) => s.id === seats[1].id)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects filling a seat that's still connected and in play", () => {
    const { room, seats } = makeStartedRoom(3);
    const { error } = midGameAddBot(room, seats[1].id);
    expect(error).toBe("That seat is occupied");
  });

  it("bot-fills a fully vacated seat (disconnect grace period already expired)", () => {
    vi.useFakeTimers();
    try {
      const { room, seats } = makeStartedRoom(3);
      handleSocketDisconnect(room, "socket-1", () => {});
      vi.advanceTimersByTime(3 * 60 * 1000);

      // The seat is gone from room.seats entirely now, but its game.seats
      // entry survives (finished, unplaced) — see vacatedSeats.
      expect(room.seats.some((s) => s.id === seats[1].id)).toBe(false);
      const vacated = vacatedSeats(room);
      expect(vacated).toEqual([{ id: seats[1].id, armIndex: seats[1].armIndex }]);

      const { seat, error } = midGameAddBot(room, vacated[0].id);
      expect(error).toBeUndefined();
      expect(seat.bot).toBe(true);
      expect(seat.armIndex).toBe(seats[1].armIndex);
      expect(room.seats.some((s) => s.id === seats[1].id)).toBe(true);
      expect(room.game.seats.find((s) => s.id === seats[1].id).finished).toBe(false);
      expect(vacatedSeats(room)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("won't fill an unknown seat id", () => {
    const { room } = makeStartedRoom(3);
    const { error } = midGameAddBot(room, "not-a-real-seat");
    expect(error).toBeTruthy();
  });
});

describe("claiming a bot seat back for a human (claimSeat)", () => {
  it("clears the bot/simulated flags once a human claims a former bot seat", () => {
    const { room, seats } = makeStartedRoom(3);
    midGameSuspendSeat(room, seats[1].id);
    midGameAddBot(room, seats[1].id);
    expect(room.seats.find((s) => s.id === seats[1].id).bot).toBe(true);

    // The bot itself has to be vacated again before a human can claim it —
    // same as any other seat (see claimableSeats).
    midGameSuspendSeat(room, seats[1].id);
    expect(claimableSeats(room).some((s) => s.id === seats[1].id)).toBe(true);

    const { seat, error } = claimSeat(room, seats[1].id, {
      name: "A Human",
      profileId: "human-profile",
      userId: "human-user",
      socketId: "socket-human",
      deviceId: "device-human",
    });
    expect(error).toBeUndefined();
    expect(seat.bot).toBe(false);
    expect(seat.simulated).toBe(false);
    expect(seat.userId).toBe("human-user");
  });
});
