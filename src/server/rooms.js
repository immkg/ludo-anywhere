import { randomBytes } from "crypto";
import { armForSeatIndex } from "../game/board.js";
import {
  createGame,
  suspendSeat as suspendGameSeat,
  removeSeatFromGame,
  reactivateSeat,
  endGame as endGameInProgress,
} from "../game/engine.js";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1
const DISCONNECT_GRACE_MS = 2 * 60 * 1000;

const rooms = new Map();

function randomRoomCode() {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function randomToken() {
  return randomBytes(12).toString("hex");
}

export function createRoom({ maxPlayers }) {
  let code;
  do {
    code = randomRoomCode();
  } while (rooms.has(code));

  const room = {
    code,
    maxPlayers,
    hostSeatId: null,
    status: "lobby", // lobby | playing | finished
    seats: [],
    game: null,
    sponsored: false, // set true at game:start when the host paid via a subscription or Game Pack credit
    disconnectTimers: new Map(), // seatId -> Timeout
    // userId -> { seats: [{ name, profileId }], fromName } — a new
    // account's join, waiting on the host to approve/decline. Only new
    // accounts go through this; reconnecting to an owned seat and an
    // already-seated account adding another of its own profiles both
    // stay instant (see server.js's room:join handler).
    pendingRequests: new Map(),
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get((code || "").toUpperCase());
}

// For rolling back a rematch room that failed to actually start (e.g. an
// entitlement check blocked a seat) — nobody should be left in a room
// that never became a real game.
export function deleteRoom(code) {
  rooms.delete((code || "").toUpperCase());
}

// Which of a finished game's seats carry into a rematch: every winner and
// the one natural loser, but not anyone the host removed mid-game (they
// never actually won — see removeSeatFromGame) — a rematch replays the
// same table, not a kicked player back in.
export function rematchEligibleSeats(room) {
  if (!room?.game) return room?.seats ?? [];
  return room.seats.filter((seat) => {
    const gameSeat = room.game.seats.find((s) => s.id === seat.id);
    return !(gameSeat?.finished && !room.game.placements.includes(seat.id));
  });
}

export function hostUserId(room) {
  return room.seats.find((s) => s.id === room.hostSeatId)?.userId ?? null;
}

// Adds one device's seats to a room. `requests` is [{ name, profileId }]
// (profiles already resolved/verified by resolveSeatProfiles). `userId` is
// the device-login adding them, kept on the seat purely so its owner can
// reclaim it later (see reconnectSeats) — separate from `profileId`, which
// is the actual player identity and is what game history/leaderboards key
// off, since the same profile can be added from more than one device-login.
// Colors are assigned automatically by join order (see armForSeatIndex) so
// a partially-filled board blanks out symmetrically rather than depending
// on which color a player happens to pick.
// Returns { room, seats, error }.
export function addSeats(room, requests, { socketId, deviceId, userId }) {
  if (!room) return { error: "Room not found" };
  if (room.status !== "lobby") return { error: "Game already started" };
  if (room.seats.length + requests.length > room.maxPlayers) {
    return { error: "Room is full" };
  }

  // A given player (profile) can only occupy one seat per room, whether
  // that's a duplicate within this same request or one already seated by
  // another device.
  const seatedProfileIds = new Set(room.seats.map((s) => s.profileId).filter(Boolean));
  for (const req of requests) {
    if (req.profileId && seatedProfileIds.has(req.profileId)) {
      return { error: "That player is already in this room" };
    }
    if (req.profileId) seatedProfileIds.add(req.profileId);
  }

  const startIndex = room.seats.length;
  const newSeats = requests.map((req, i) => ({
    id: randomToken(),
    token: randomToken(),
    name: (req.name || "Player").slice(0, 20),
    armIndex: armForSeatIndex(startIndex + i, room.maxPlayers),
    deviceId,
    profileId: req.profileId || null,
    userId: userId || null,
    socketId,
    connected: true,
  }));

  room.seats.push(...newSeats);
  if (!room.hostSeatId) room.hostSeatId = newSeats[0].id;

  return { room, seats: newSeats };
}

// Host-only, lobby-only: drops one seat to free up the slot. Refuses to
// go below 2 players — a room always needs at least a host and one
// opponent — and reassigns hostSeatId the same way a lobby disconnect
// already does (see handleSocketDisconnect) if the removed seat was the
// host. Not a ban: the removed player can rejoin with the room code like
// anyone else.
export function removeSeat(room, seatId) {
  if (!room) return { error: "Room not found" };
  if (room.status !== "lobby") return { error: "Game already started" };
  if (room.seats.length <= 2) return { error: "A room needs at least 2 players" };

  const seat = room.seats.find((s) => s.id === seatId);
  if (!seat) return { error: "Player not found" };

  room.seats = room.seats.filter((s) => s.id !== seatId);
  if (room.hostSeatId === seatId) {
    room.hostSeatId = room.seats[0]?.id ?? null;
  }

  return { room };
}

// Reattaches previously-known seats to a new socket, e.g. after a page
// refresh, a crash, or reopening on a different device — matched either by
// the seat's persisted token (same browser) or by the connecting device
// login owning the seat (any device, as long as they're signed in as the
// same Google account that added it). If the seat had been suspended (see
// suspendSeat/midGameSuspendSeat below), reconnecting its original owner
// resumes it automatically — no separate host action needed for that case.
export function reconnectSeats(room, tokens, socketId, userId) {
  if (!room) return [];
  const reconnected = [];
  for (const seat of room.seats) {
    if (tokens.includes(seat.token) || (userId && seat.userId === userId)) {
      seat.socketId = socketId;
      seat.connected = true;
      clearDisconnectTimer(room, seat.id);
      if (room.game?.seats.find((s) => s.id === seat.id)?.suspended) {
        room.game = reactivateSeat(room.game, seat.id);
      }
      reconnected.push(seat);
    }
  }
  return reconnected;
}

// Host-only, mid-game: pauses a seat — skipped for turns, tokens stay put
// and stay capturable. Refuses a seat that's already won (untouchable)
// or already paused.
export function midGameSuspendSeat(room, seatId) {
  if (!room?.game || room.status !== "playing") return { error: "Game not in progress" };
  const gameSeat = room.game.seats.find((s) => s.id === seatId);
  if (!gameSeat) return { error: "Player not found" };
  if (gameSeat.finished) return { error: "That player already finished" };
  if (gameSeat.suspended) return { error: "Already paused" };

  room.game = suspendGameSeat(room.game, seatId);
  return { room };
}

// Host-only: undoes a pause without needing the original account to
// reconnect (reconnecting also resumes automatically — see
// reconnectSeats above; this is for when the host just wants to unpause
// them directly, e.g. before handing the seat to someone else).
export function midGameResumeSeat(room, seatId) {
  if (!room?.game) return { error: "Game not in progress" };
  const gameSeat = room.game.seats.find((s) => s.id === seatId);
  if (!gameSeat?.suspended) return { error: "That player isn't paused" };

  room.game = reactivateSeat(room.game, seatId);
  return { room };
}

// Host-only, mid-game: removes a seat for good — tokens clear to the
// yard, the seat drops out of active play (see removeSeatFromGame),
// and it becomes claimable by someone else (see claimSeat below). A
// winner can't be removed, and the game always needs at least 2 seats
// still in play (active or paused) — mirrors the lobby's removeSeat
// floor, just counted against who's still actually in the game rather
// than room.seats.length, which never shrinks mid-game.
export function midGameRemoveSeat(room, seatId) {
  if (!room?.game || room.status !== "playing") return { error: "Game not in progress" };
  const gameSeat = room.game.seats.find((s) => s.id === seatId);
  if (!gameSeat) return { error: "Player not found" };
  if (gameSeat.finished) return { error: "Can't remove a player who already finished" };

  const stillInPlay = room.game.seats.filter((s) => !s.finished).length;
  if (stillInPlay <= 2) return { error: "A game needs at least 2 players still in it" };

  room.game = removeSeatFromGame(room.game, seatId);
  return { room };
}

// Host-only: stops the game outright without declaring a winner or a
// loser — see engine.js's endGame. Unlike midGameRemoveSeat, this doesn't
// require narrowing down to one seat first; the host can call it any time
// mid-game, and whoever hadn't already finished just gets a neutral,
// unresolved result recorded (see history.js/leaderboard).
export function midGameEndGame(room) {
  if (!room?.game || room.status !== "playing") return { error: "Game not in progress" };
  room.game = endGameInProgress(room.game);
  return { room };
}

// Host-only: hands the host role to a different connected, non-paused
// seat. Works in either the lobby or mid-game.
export function transferHost(room, toSeatId) {
  if (!room) return { error: "Room not found" };
  const seat = room.seats.find((s) => s.id === toSeatId);
  if (!seat) return { error: "Player not found" };
  if (!seat.connected) return { error: "That player isn't connected" };
  if (room.game?.seats.find((s) => s.id === toSeatId)?.suspended) {
    return { error: "Can't make a paused player the host" };
  }

  room.hostSeatId = toSeatId;
  return { room };
}

// Which of a mid-game room's seats are up for grabs: paused (resumable)
// or removed-and-never-actually-won. Winners and normally-still-playing
// seats aren't claimable.
export function claimableSeats(room) {
  if (!room?.game) return [];
  return room.seats.filter((seat) => {
    const gameSeat = room.game.seats.find((s) => s.id === seat.id);
    if (!gameSeat) return false;
    if (gameSeat.suspended) return true;
    return gameSeat.finished && !room.game.placements.includes(seat.id);
  });
}

// Reassigns one claimable seat to a different account — mirrors addSeats'
// shape (name/profileId/userId/socketId) but mutates the existing seat in
// place instead of appending one, and reactivates the underlying game
// seat so the new occupant actually gets turns. A fresh reconnect token
// is issued since this is a new occupant, not the seat's original owner.
export function claimSeat(room, seatId, { name, profileId, userId, socketId, deviceId }) {
  if (!room?.game) return { error: "Game not in progress" };
  const seat = room.seats.find((s) => s.id === seatId);
  if (!seat) return { error: "Seat not found" };
  if (!claimableSeats(room).some((s) => s.id === seatId)) {
    return { error: "That seat isn't available" };
  }

  Object.assign(seat, {
    name: (name || "Player").slice(0, 20),
    profileId: profileId || null,
    userId: userId || null,
    socketId,
    deviceId,
    connected: true,
    token: randomToken(),
  });
  room.game = reactivateSeat(room.game, seatId);
  return { room, seat };
}

export function findSeatBySocket(room, socketId) {
  return room.seats.find((s) => s.socketId === socketId);
}

function clearDisconnectTimer(room, seatId) {
  const timer = room.disconnectTimers.get(seatId);
  if (timer) {
    clearTimeout(timer);
    room.disconnectTimers.delete(seatId);
  }
}

// Marks every seat owned by this socket as disconnected. In the lobby the
// seat is dropped immediately (freeing the slot); mid-game it's kept, marked
// disconnected, and pruned after a grace period so a refresh/reconnect can
// resume the seat without losing tokens.
export function handleSocketDisconnect(room, socketId, onChange) {
  if (!room) return;
  const affected = room.seats.filter((s) => s.socketId === socketId);
  if (affected.length === 0) return;

  if (room.status === "lobby") {
    room.seats = room.seats.filter((s) => s.socketId !== socketId);
    if (room.hostSeatId && !room.seats.find((s) => s.id === room.hostSeatId)) {
      room.hostSeatId = room.seats[0]?.id ?? null;
    }
    if (room.seats.length === 0) rooms.delete(room.code);
    onChange();
    return;
  }

  affected.forEach((seat) => {
    seat.connected = false;
    clearDisconnectTimer(room, seat.id);
    const timer = setTimeout(() => {
      room.seats = room.seats.filter((s) => s.id !== seat.id);
      room.disconnectTimers.delete(seat.id);
      if (room.seats.every((s) => !s.connected)) rooms.delete(room.code);
      onChange();
    }, DISCONNECT_GRACE_MS);
    room.disconnectTimers.set(seat.id, timer);
  });
  onChange();
}

export function startGame(room) {
  if (room.status !== "lobby") return { error: "Game already started" };
  if (room.seats.length < 2) return { error: "Need at least 2 players" };

  // addSeats already rejects a profile joining twice, but this is a cheap
  // last check right before locking in the roster, in case seats ever got
  // here some other way.
  const profileIds = room.seats.map((s) => s.profileId).filter(Boolean);
  if (new Set(profileIds).size !== profileIds.length) {
    return { error: "Duplicate players in room" };
  }

  room.status = "playing";
  room.startedAt = new Date();
  room.game = createGame(room.seats.map((s) => ({ id: s.id, armIndex: s.armIndex })));
  return { room };
}

export function serializeRoom(room) {
  return {
    code: room.code,
    maxPlayers: room.maxPlayers,
    hostSeatId: room.hostSeatId,
    status: room.status,
    sponsored: room.sponsored,
    seats: room.seats.map((s) => ({
      id: s.id,
      name: s.name,
      armIndex: s.armIndex,
      deviceId: s.deviceId,
      connected: s.connected,
      profileId: s.profileId ?? null,
    })),
  };
}

export function serializeGame(room) {
  return room.game;
}
