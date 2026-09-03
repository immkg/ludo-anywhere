import { describe, it, expect } from "vitest";
import {
  createRoom,
  addSeats,
  startGame,
  midGameSuspendSeat,
  midGameRemoveSeat,
  assignMidGameSeat,
  isBotOnlyGame,
  pickMidGameJoinTarget,
  handleSocketDisconnect,
} from "./rooms.js";

function makeStartedRoom({ humans = 2, bots = 0 } = {}) {
  const room = createRoom({ maxPlayers: 4 });
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

const IDENTITY = { name: "Newcomer", profileId: "profile-9", userId: "user-9", socketId: "s9", deviceId: "d9" };

describe("assignMidGameSeat", () => {
  it("rejects a room that hasn't started", () => {
    const room = createRoom({ maxPlayers: 4 });
    addSeats(room, [{ name: "P0", profileId: "profile-0" }], { socketId: "s0", deviceId: "d0", userId: "u0" });
    const seatId = room.seats[0].id;
    expect(assignMidGameSeat(room, seatId, IDENTITY)).toEqual({ error: "Game not in progress" });
  });

  it("rejects an actively-playing human seat", () => {
    const room = makeStartedRoom({ humans: 2 });
    const seatId = room.seats[0].id;
    expect(assignMidGameSeat(room, seatId, IDENTITY)).toEqual({ error: "That seat isn't available" });
  });

  it("hands over an active bot seat directly, no suspend step needed", () => {
    const room = makeStartedRoom({ humans: 2, bots: 1 });
    const botSeat = room.seats.find((s) => s.bot);
    const armIndex = botSeat.armIndex;

    const { seat, error } = assignMidGameSeat(room, botSeat.id, IDENTITY);
    expect(error).toBeUndefined();
    expect(seat.id).toBe(botSeat.id);
    expect(seat.bot).toBe(false);
    expect(seat.name).toBe("Newcomer");
    expect(seat.userId).toBe("user-9");
    expect(seat.armIndex).toBe(armIndex);
    expect(room.game.seats.find((s) => s.id === botSeat.id).suspended).toBe(false);
  });

  it("claims a suspended seat, same as claimSeat would", () => {
    const room = makeStartedRoom({ humans: 2 });
    const seatId = room.seats[1].id;
    midGameSuspendSeat(room, seatId);

    const { seat, error } = assignMidGameSeat(room, seatId, IDENTITY);
    expect(error).toBeUndefined();
    expect(seat.userId).toBe("user-9");
    expect(room.game.seats.find((s) => s.id === seatId).suspended).toBe(false);
  });

  it("claims a removed-and-unclaimed seat", () => {
    const room = makeStartedRoom({ humans: 3 });
    const seatId = room.seats[2].id;
    midGameRemoveSeat(room, seatId);

    const { seat, error } = assignMidGameSeat(room, seatId, IDENTITY);
    expect(error).toBeUndefined();
    expect(seat.userId).toBe("user-9");
  });

  it("reconstructs a fully-vacated seat (no room.seats row left at all)", () => {
    const room = makeStartedRoom({ humans: 3 });
    const seatId = room.seats[1].id;
    const armIndex = room.seats[1].armIndex;
    const { error: removeError } = midGameRemoveSeat(room, seatId);
    expect(removeError).toBeUndefined();
    // Simulate the disconnect-grace prune that drops the row from room.seats
    // entirely (see handleSocketDisconnect's setTimeout branch) — nothing
    // left in room.seats, but the game.seats entry survives.
    room.seats = room.seats.filter((s) => s.id !== seatId);
    expect(room.seats.find((s) => s.id === seatId)).toBeUndefined();

    const { seat, error } = assignMidGameSeat(room, seatId, IDENTITY);
    expect(error).toBeUndefined();
    expect(seat.id).toBe(seatId);
    expect(seat.armIndex).toBe(armIndex);
    expect(seat.userId).toBe("user-9");
    expect(room.seats.some((s) => s.id === seatId)).toBe(true);
  });

  it("errors on a seat id that was never part of this game", () => {
    const room = makeStartedRoom({ humans: 2 });
    expect(assignMidGameSeat(room, "not-a-real-seat", IDENTITY)).toEqual({ error: "Seat not found" });
  });
});

describe("isBotOnlyGame", () => {
  it("is false while any human seat remains, connected or not", () => {
    const room = makeStartedRoom({ humans: 1, bots: 3 });
    expect(isBotOnlyGame(room)).toBe(false);
    room.seats.find((s) => !s.bot).connected = false;
    expect(isBotOnlyGame(room)).toBe(false);
  });

  it("is true once every seat is a bot", () => {
    const room = makeStartedRoom({ humans: 1, bots: 3 });
    room.seats = room.seats.filter((s) => s.bot);
    expect(isBotOnlyGame(room)).toBe(true);
  });

  it("is false for a bot-only room still in the lobby", () => {
    const room = createRoom({ maxPlayers: 4 });
    addSeats(room, [{ name: "Bot 1" }], { bot: true });
    expect(isBotOnlyGame(room)).toBe(false);
  });
});

describe("pickMidGameJoinTarget", () => {
  it("prefers a suspended human seat over an active bot", () => {
    const room = makeStartedRoom({ humans: 2, bots: 1 });
    const suspendedId = room.seats[1].id;
    midGameSuspendSeat(room, suspendedId);
    expect(pickMidGameJoinTarget(room)).toBe(suspendedId);
  });

  it("falls back to a fully-vacated seat when no seat row is open", () => {
    const room = makeStartedRoom({ humans: 3, bots: 1 });
    const vacatedId = room.seats[1].id;
    midGameRemoveSeat(room, vacatedId);
    room.seats = room.seats.filter((s) => s.id !== vacatedId);

    expect(pickMidGameJoinTarget(room)).toBe(vacatedId);
  });

  it("falls back to an active bot when nothing else is open", () => {
    const room = makeStartedRoom({ humans: 2, bots: 1 });
    const botId = room.seats.find((s) => s.bot).id;
    expect(pickMidGameJoinTarget(room)).toBe(botId);
  });

  it("returns null when there is truly nothing to hand over", () => {
    const room = makeStartedRoom({ humans: 2 });
    expect(pickMidGameJoinTarget(room)).toBeNull();
  });
});

describe("handleSocketDisconnect host reassignment", () => {
  it("hands host to the next connected human, never a bot", () => {
    const room = makeStartedRoom({ humans: 2, bots: 2 });
    const [host, human2] = room.seats.filter((s) => !s.bot);
    room.hostSeatId = host.id;

    handleSocketDisconnect(room, host.socketId, () => {});
    expect(room.hostSeatId).toBe(human2.id);
  });

  it("leaves hostSeatId on the disconnected host when no other human is connected", () => {
    const room = makeStartedRoom({ humans: 1, bots: 2 });
    const host = room.seats.find((s) => !s.bot);
    room.hostSeatId = host.id;

    handleSocketDisconnect(room, host.socketId, () => {});
    expect(room.hostSeatId).toBe(host.id);
  });
});
