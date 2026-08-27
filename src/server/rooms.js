import { randomBytes } from "crypto";
import { armForSeatIndex } from "../game/board.js";
import { createGame } from "../game/engine.js";

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
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get((code || "").toUpperCase());
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

// Reattaches previously-known seats to a new socket, e.g. after a page
// refresh, a crash, or reopening on a different device — matched either by
// the seat's persisted token (same browser) or by the connecting device
// login owning the seat (any device, as long as they're signed in as the
// same Google account that added it).
export function reconnectSeats(room, tokens, socketId, userId) {
  if (!room) return [];
  const reconnected = [];
  for (const seat of room.seats) {
    if (tokens.includes(seat.token) || (userId && seat.userId === userId)) {
      seat.socketId = socketId;
      seat.connected = true;
      clearDisconnectTimer(room, seat.id);
      reconnected.push(seat);
    }
  }
  return reconnected;
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
    })),
  };
}

export function serializeGame(room) {
  return room.game;
}
