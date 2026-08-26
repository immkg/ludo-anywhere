import { randomBytes } from "crypto";
import { armsForPlayerCount, armForSeatIndex } from "../game/board.js";
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
    disconnectTimers: new Map(), // seatId -> Timeout
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get((code || "").toUpperCase());
}

// Adds one device's seats to a room. `requests` is [{ name }]. Colors/arms
// are assigned automatically by join order (see armForSeatIndex) so a
// partially-filled classic board blanks out symmetrically rather than
// depending on which color a player happens to pick.
// Returns { room, seats, error }.
export function addSeats(room, requests, { socketId, deviceId }) {
  if (!room) return { error: "Room not found" };
  if (room.status !== "lobby") return { error: "Game already started" };
  if (room.seats.length + requests.length > room.maxPlayers) {
    return { error: "Room is full" };
  }

  const startIndex = room.seats.length;
  const newSeats = requests.map((req, i) => ({
    id: randomToken(),
    token: randomToken(),
    name: (req.name || "Player").slice(0, 20),
    armIndex: armForSeatIndex(startIndex + i, room.maxPlayers),
    deviceId,
    socketId,
    connected: true,
  }));

  room.seats.push(...newSeats);
  if (!room.hostSeatId) room.hostSeatId = newSeats[0].id;

  return { room, seats: newSeats };
}

// Reattaches previously-known seats (by their persisted tokens) to a new
// socket, e.g. after a page refresh or reconnect.
export function reconnectSeats(room, tokens, socketId) {
  if (!room) return [];
  const reconnected = [];
  for (const seat of room.seats) {
    if (tokens.includes(seat.token)) {
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

  const arms = armsForPlayerCount(room.maxPlayers);
  room.status = "playing";
  room.game = createGame(
    room.seats.map((s) => ({ id: s.id, armIndex: s.armIndex })),
    arms
  );
  return { room };
}

export function serializeRoom(room) {
  return {
    code: room.code,
    maxPlayers: room.maxPlayers,
    arms: armsForPlayerCount(room.maxPlayers),
    hostSeatId: room.hostSeatId,
    status: room.status,
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
