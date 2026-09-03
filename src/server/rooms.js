import { randomBytes } from "crypto";
import { armForSeatIndex } from "../game/board.js";
import {
  createGame,
  suspendSeat as suspendGameSeat,
  removeSeatFromGame,
  reactivateSeat,
  endGame as endGameInProgress,
  seatProgress,
} from "../game/engine.js";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1
const DISCONNECT_GRACE_MS = 2 * 60 * 1000;

// Spectator chat: a free-text side channel scoped to spectators only (see
// spectator:chat:send in server.js), deliberately not the players' own
// quick-chat/reaction stream (game:reaction) — a much smaller, lower-risk
// audience than the full player base, so this just needs basic sanity
// limits, not a moderation system. SPECTATOR_CHAT_BACKLOG bounds
// room.spectatorChat itself so a long-running room's history can't grow
// unboundedly; a spectator only ever sees this many past messages on
// joining (see room:watch's spectator:chat:history push in server.js).
export const SPECTATOR_CHAT_MAX_LENGTH = 240;
const SPECTATOR_CHAT_BACKLOG = 50;
const SPECTATOR_CHAT_MIN_INTERVAL_MS = 1200;

// How far along a host's early end (see midGameEndGame) needs to be before
// it declares a real winner/loser from the current board instead of
// leaving it unresolved — both must hold, not just one, so neither a
// long-idle game with barely any rolls nor a very fast bot-heavy game
// qualifies on a single signal.
const MIN_DURATION_FOR_EARLY_RESULT_MS = 10 * 60 * 1000;
const MIN_ROLLS_FOR_EARLY_RESULT = 40;

// First names for simulated matchmaking bots (see addSimulatedBot) — picked
// to read as ordinary players to this app's Indian user base, not as
// obviously-generated filler like "Bot 1".
const SIMULATED_BOT_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Ishaan", "Kabir",
  "Rohan", "Karan", "Yash", "Dev", "Siddharth", "Rahul", "Vikram", "Aryan",
  "Ananya", "Diya", "Ishita", "Kavya", "Meera", "Neha", "Pooja", "Priya",
  "Riya", "Simran", "Sneha", "Tanvi", "Anjali", "Shreya",
];

function pickSimulatedBotName(room) {
  const used = new Set(room.seats.map((s) => s.name));
  const available = SIMULATED_BOT_NAMES.filter((n) => !used.has(n));
  const pool = available.length > 0 ? available : SIMULATED_BOT_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

const rooms = new Map();

// A guest (no signed-in account) is identified by device rather than by a
// real User id — this synthetic key stands in for `userId` anywhere a
// pending join request or presence-channel needs a unique per-joiner string
// (see room:join/room:joinRequest:approve in server.js). Never written to
// a seat's actual `userId` field — see isGuestKey below.
export function guestKeyFor(deviceId) {
  return `guest:${deviceId}`;
}

export function isGuestKey(key) {
  return typeof key === "string" && key.startsWith("guest:");
}

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
    // userIds the host has explicitly invited via room:invite — their next
    // join skips the approval step too, since the host already vouched for
    // them by name (see server.js's room:join handler).
    invitedUserIds: new Set(),
    // Whether a viewer with no seat can watch without the host's say-so —
    // "private" (default) needs host approval per watcher and keeps their
    // identity out of anything broadcast to the room (see addSpectator);
    // "public" admits anyone who asks and exposes a live count (see
    // serializeRoom's spectatorCount) but never the individual watchers'
    // names to non-host clients. See room:setSpectatePolicy in server.js.
    spectatePolicy: "private",
    // Joined-but-unseated viewers — never affects turn order/placements
    // (see src/game/engine.js, which has no concept of these at all), just
    // a live list the host/UI can count. Reconnected by token/userId the
    // same shape as a seat (see reconnectSpectator), but with no
    // disconnect-grace-period pruning mid-game — there's no game state at
    // stake, so a disconnected one is just marked, not pruned (see
    // handleSocketDisconnect).
    spectators: [],
    // Same shape/purpose as pendingRequests above, just for "watch" asks
    // instead of "seat" asks — kept separate so the same person can have
    // one of each pending at once without colliding (see room:watch in
    // server.js).
    pendingSpectateRequests: new Map(),
    // A signed-in, unseated visitor asking the host for a spot in an
    // already-playing game — from the home dashboard's Live Matches "Join"
    // (see room:midGameJoinRequest in server.js). Kept separate from
    // pendingRequests above: those always resolve to a specific seat chosen
    // by the requester (see room:claimSeat), while these are generic asks
    // the host resolves at approval time by picking a target themselves
    // (see assignMidGameSeat) — mixing the two shapes into one map would
    // make pending.claimSeatId's presence ambiguous.
    pendingMidGameRequests: new Map(),
    // Bounded backlog for the spectator-only chat channel (see
    // addSpectatorChatMessage below) — a spectator who joins mid-
    // conversation gets this handed to them once (spectator:chat:history in
    // server.js), then just listens for new ones like everyone else.
    spectatorChat: [],
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get((code || "").toUpperCase());
}

// Every live room — used only by server.js's sweepTurnTimeouts, which
// needs to check every "playing" room's turn deadline each tick rather
// than relying on each individual mutation to remember to reschedule one.
export function allRooms() {
  return rooms.values();
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
export function addSeats(room, requests, { socketId, deviceId, userId, bot } = {}) {
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
    ...(bot ? { bot: true } : {}),
  }));

  room.seats.push(...newSeats);
  if (!room.hostSeatId) room.hostSeatId = newSeats[0].id;

  return { room, seats: newSeats };
}

// Shared by fillWithBots (lobby, possibly several at once) and
// midGameAddBot (mid-game, always one) — numbered after whatever bots (if
// any) are already seated so a second fill (e.g. after removing one)
// doesn't repeat a name.
function nextBotNumber(room) {
  const existingBotNumbers = room.seats
    .filter((s) => s.bot)
    .map((s) => Number(s.name.replace("Bot ", "")))
    .filter((n) => Number.isFinite(n));
  return existingBotNumbers.length > 0 ? Math.max(...existingBotNumbers) + 1 : 1;
}

// Host-only, lobby-only: fills every remaining open seat with a bot. A bot
// seat has no deviceId/profileId/userId/socketId behind it — it's never
// reconnected to, never charged (see checkGameStart, which only charges
// seats with a userId), and plays itself server-side once it's its turn
// (see scheduleBotTurn in server.js).
export function fillWithBots(room) {
  if (!room) return { error: "Room not found" };
  if (room.status !== "lobby") return { error: "Game already started" };

  const openSlots = room.maxPlayers - room.seats.length;
  if (openSlots <= 0) return { error: "Room is full" };

  const startingNumber = nextBotNumber(room);
  const startIndex = room.seats.length;
  const newSeats = Array.from({ length: openSlots }, (_, i) => ({
    id: randomToken(),
    token: randomToken(),
    name: `Bot ${startingNumber + i}`,
    armIndex: armForSeatIndex(startIndex + i, room.maxPlayers),
    deviceId: null,
    profileId: null,
    userId: null,
    socketId: null,
    connected: true,
    bot: true,
  }));

  room.seats.push(...newSeats);
  if (!room.hostSeatId) room.hostSeatId = newSeats[0].id;

  return { room, seats: newSeats };
}

// Matchmaking-only: adds a single bot seat, one at a time, made to look like
// an ordinary player joining rather than a bot-fill — a random name from
// SIMULATED_BOT_NAMES, and `simulated: true` so PlayerSeatCard/PlayerCorner
// skip the robot badge/label for it (see their `bot && !simulated` checks).
// Still `bot: true` underneath, so it plays itself once seated (see
// scheduleBotTurn in server.js) and is never charged (checkGameStart only
// charges seats with a userId). Called by scheduleMatchmakingBotFill in
// server.js on a randomized delay while a matchmaking room's host is
// waiting alone, so an empty room doesn't just sit there with nothing the
// host can do.
export function addSimulatedBot(room) {
  if (!room) return { error: "Room not found" };
  if (room.status !== "lobby") return { error: "Game already started" };
  if (room.seats.length >= room.maxPlayers) return { error: "Room is full" };

  const seat = {
    id: randomToken(),
    token: randomToken(),
    name: pickSimulatedBotName(room),
    armIndex: armForSeatIndex(room.seats.length, room.maxPlayers),
    deviceId: null,
    profileId: null,
    userId: null,
    socketId: null,
    connected: true,
    bot: true,
    simulated: true,
  };

  room.seats.push(seat);
  if (!room.hostSeatId) room.hostSeatId = seat.id;

  return { room, seat };
}

// Lobby-only: drops one seat to free up the slot. Who's allowed to remove
// which seat is enforced by the caller (room:removeSeat in server.js) —
// the host can remove anyone but themselves, and can go all the way down
// to hosting alone. Reassigns hostSeatId the same way a lobby disconnect
// already does (see handleSocketDisconnect) if the removed seat was the
// host. Not a ban: the removed player can rejoin with the room code like
// anyone else.
export function removeSeat(room, seatId) {
  if (!room) return { error: "Room not found" };
  if (room.status !== "lobby") return { error: "Game already started" };

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
      // Cumulative disconnected time for this game, for the leaderboard's
      // 5-minute exclusion rule (see history.js) — a seat can disconnect
      // and reconnect more than once in one game, so this accumulates
      // across every stretch rather than only tracking the most recent one.
      if (seat.disconnectedAt) {
        seat.totalDisconnectedMs = (seat.totalDisconnectedMs || 0) + (Date.now() - seat.disconnectedAt);
        seat.disconnectedAt = null;
      }
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

// Mid-game seats with no living owner at all: their game.seats entry
// survives (finished, never placed) but the seat itself already dropped out
// of room.seats via handleSocketDisconnect's grace-period prune — the arm
// just sits empty on the board with nothing left for the usual
// pause/remove/claim UI (which all key off room.seats) to target. Exposed
// on serializeRoom so the host can still fill one with a bot (see
// midGameAddBot).
export function vacatedSeats(room) {
  if (!room?.game) return [];
  const seatedIds = new Set(room.seats.map((s) => s.id));
  return room.game.seats
    .filter((s) => s.finished && !room.game.placements.includes(s.id) && !seatedIds.has(s.id))
    .map((s) => ({ id: s.id, armIndex: s.armIndex }));
}

// Host-only, mid-game: fills a currently-unoccupied seat with a bot — one
// that's paused, host-removed-and-unclaimed, still mid-disconnect-grace
// (connected: false, not yet pruned), or fully vacated (see vacatedSeats
// above). Reuses reactivateSeat (src/game/engine.js) the same way
// claimSeat/resumeSeat do — bot-filling isn't a new resolution kind, just a
// new *occupant* for an already-supported one, so turn order/whose-turn
// logic there needs no changes. Pulling the bot back out later is just the
// existing room:removeSeat/midGameRemoveSeat path (see server.js) — no
// different from removing a human seat — which leaves the seat claimable
// again for a human via claimSeat (see room:claimSeat), same as any other
// removed seat.
export function midGameAddBot(room, seatId) {
  if (!room?.game || room.status !== "playing") return { error: "Game not in progress" };

  const seat = room.seats.find((s) => s.id === seatId);
  const gameSeat = room.game.seats.find((s) => s.id === seatId);

  if (seat) {
    if (!gameSeat) return { error: "Player not found" };
    const removedUnclaimed = gameSeat.finished && !room.game.placements.includes(seatId);
    // A connected, still-in-play seat isn't up for grabs — the host has to
    // pause or remove it first (see midGameSuspendSeat/midGameRemoveSeat),
    // same as claimableSeats requires for a human to take it over.
    const vacant = gameSeat.suspended || removedUnclaimed || (!seat.connected && !gameSeat.finished);
    if (!vacant) return { error: "That seat is occupied" };

    // The seat's identity is being replaced by a bot — a pending
    // disconnect-grace timer for it must not fire later and prune what is
    // now a bot seat out from under it (see handleSocketDisconnect).
    clearDisconnectTimer(room, seatId);
    Object.assign(seat, {
      name: `Bot ${nextBotNumber(room)}`,
      token: randomToken(),
      deviceId: null,
      profileId: null,
      userId: null,
      socketId: null,
      connected: true,
      bot: true,
      simulated: false,
    });
    room.game = reactivateSeat(room.game, seatId);
    return { room, seat };
  }

  // Not in room.seats at all — fully vacated. Reconstruct a seat around the
  // same id so reactivateSeat's change actually attaches to something real
  // again (see vacatedSeats above).
  if (!gameSeat || !gameSeat.finished || room.game.placements.includes(seatId)) {
    return { error: "Seat not found" };
  }

  const newSeat = {
    id: seatId,
    token: randomToken(),
    name: `Bot ${nextBotNumber(room)}`,
    armIndex: gameSeat.armIndex,
    deviceId: null,
    profileId: null,
    userId: null,
    socketId: null,
    connected: true,
    bot: true,
  };
  room.seats.push(newSeat);
  room.game = reactivateSeat(room.game, seatId);
  return { room, seat: newSeat };
}

// Host-approved hand-off for a mid-game join request from the home
// dashboard's Live Matches "Join" (see room:midGameJoinRequest:approve in
// server.js) — the host picks `seatId` themselves (an open seat per
// midGameAddBot's "vacant" definition, or any actively-playing bot seat),
// so unlike claimSeat this doesn't require the target to already be in
// claimableSeats. Mirrors midGameAddBot's two shapes (still in room.seats
// vs fully vacated) with one addition: an active bot seat (`seat.bot`,
// still connected and playing) is always available to hand over directly,
// no suspend-then-claim two-step needed first.
export function assignMidGameSeat(room, seatId, { name, profileId, userId, socketId, deviceId }) {
  if (!room?.game || room.status !== "playing") return { error: "Game not in progress" };

  const identity = {
    name: (name || "Player").slice(0, 20),
    token: randomToken(),
    deviceId: deviceId ?? null,
    profileId: profileId || null,
    userId: userId || null,
    socketId: socketId ?? null,
    connected: true,
    bot: false,
    simulated: false,
  };

  const seat = room.seats.find((s) => s.id === seatId);
  const gameSeat = room.game.seats.find((s) => s.id === seatId);

  if (seat) {
    if (!gameSeat) return { error: "Player not found" };
    const removedUnclaimed = gameSeat.finished && !room.game.placements.includes(seatId);
    const available = seat.bot || gameSeat.suspended || removedUnclaimed || (!seat.connected && !gameSeat.finished);
    if (!available) return { error: "That seat isn't available" };

    clearDisconnectTimer(room, seatId);
    Object.assign(seat, identity);
    room.game = reactivateSeat(room.game, seatId);
    return { room, seat };
  }

  if (!gameSeat || !gameSeat.finished || room.game.placements.includes(seatId)) {
    return { error: "Seat not found" };
  }

  const newSeat = { id: seatId, armIndex: gameSeat.armIndex, ...identity };
  room.seats.push(newSeat);
  room.game = reactivateSeat(room.game, seatId);
  return { room, seat: newSeat };
}

// Host-only: stops the game outright — see engine.js's endGame. Unlike
// midGameRemoveSeat, this doesn't require narrowing down to one seat
// first; the host can call it any time mid-game. Once the room has been
// playing long enough (see MIN_DURATION_FOR_EARLY_RESULT_MS/
// MIN_ROLLS_FOR_EARLY_RESULT), whoever hadn't already finished gets ranked
// by their current board progress instead of left unresolved — a game
// that's barely started still just gets the old neutral, no-result-
// recorded ending (see history.js/leaderboard).
export function midGameEndGame(room) {
  if (!room?.game || room.status !== "playing") return { error: "Game not in progress" };
  const elapsedMs = room.startedAt ? Date.now() - room.startedAt.getTime() : 0;
  const declareWinner =
    elapsedMs >= MIN_DURATION_FOR_EARLY_RESULT_MS && room.game.rollSeq >= MIN_ROLLS_FOR_EARLY_RESULT;
  room.game = endGameInProgress(room.game, { declareWinner });
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
// Also explicitly clears bot/simulated — a claimable seat can now be a bot
// mid-game hosted itself (see midGameAddBot), and without this a human who
// claims it back would silently stay flagged as a bot forever.
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
    bot: false,
    simulated: false,
  });
  room.game = reactivateSeat(room.game, seatId);
  return { room, seat };
}

// Spectators: a joined-but-unseated viewer (see room:watch in server.js).
// Reconnects in place rather than duplicating if this same account/device
// is already watching (e.g. a second tab, or the approval push landing
// after the requester's own client already sped ahead) — the same
// one-identity-one-slot rule addSeats enforces for seats.
export function addSpectator(room, { name, userId, deviceId, socketId }) {
  if (!room) return { error: "Room not found" };
  const existing = room.spectators.find((s) => (userId ? s.userId === userId : deviceId && s.deviceId === deviceId));
  if (existing) {
    Object.assign(existing, { socketId, connected: true });
    return { room, spectator: existing };
  }

  const spectator = {
    id: randomToken(),
    token: randomToken(),
    name: (name || "A guest").slice(0, 20),
    userId: userId || null,
    deviceId: deviceId || null,
    socketId,
    connected: true,
  };
  room.spectators.push(spectator);
  return { room, spectator };
}

// Reattaches a previously-known spectator to a new socket — same
// token-or-userId matching as reconnectSeats, just against room.spectators
// instead of room.seats. Returns null (not an object) when nothing
// matches, since there's no seat-shaped error path a caller needs here.
export function reconnectSpectator(room, tokens, socketId, userId) {
  if (!room) return null;
  const spectator = room.spectators.find((s) => tokens.includes(s.token) || (userId && s.userId === userId));
  if (!spectator) return null;
  spectator.socketId = socketId;
  spectator.connected = true;
  return spectator;
}

export function setSpectatePolicy(room, policy) {
  if (!room) return { error: "Room not found" };
  if (policy !== "private" && policy !== "public") return { error: "Invalid setting" };
  room.spectatePolicy = policy;
  return { room };
}

// Validates and appends one spectator chat message — see
// spectator:chat:send in server.js. `spectatorId` must name a real entry in
// room.spectators (not just any connected socket) so a message is always
// attributable to a known watcher. Basic sanity limits only: trimmed,
// non-empty, capped at SPECTATOR_CHAT_MAX_LENGTH, and a light per-spectator
// rate limit (SPECTATOR_CHAT_MIN_INTERVAL_MS) tracked via the spectator's
// own lastChatAt — this is a free-text channel for a small, low-risk
// audience, not a moderation system. `now` is only a parameter so tests can
// pass a fixed clock instead of racing Date.now().
export function addSpectatorChatMessage(room, spectatorId, rawText, now = Date.now()) {
  if (!room) return { error: "Room not found" };
  const spectator = room.spectators.find((s) => s.id === spectatorId);
  if (!spectator) return { error: "Not watching this room" };

  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text) return { error: "Message can't be empty" };
  if (text.length > SPECTATOR_CHAT_MAX_LENGTH) {
    return { error: `Message is too long (max ${SPECTATOR_CHAT_MAX_LENGTH} characters)` };
  }
  if (spectator.lastChatAt != null && now - spectator.lastChatAt < SPECTATOR_CHAT_MIN_INTERVAL_MS) {
    return { error: "You're sending messages too fast" };
  }
  spectator.lastChatAt = now;

  const message = { id: randomToken(), fromId: spectator.id, fromName: spectator.name, text, ts: now };
  room.spectatorChat.push(message);
  if (room.spectatorChat.length > SPECTATOR_CHAT_BACKLOG) room.spectatorChat.shift();
  return { room, message };
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
//
// A spectating socket is handled here too, with the same lobby-vs-mid-game
// split as a seat (dropped outright in the lobby, just marked disconnected
// mid-game) — but never pruned mid-game the way a seat eventually is: a
// spectator holds no game state, so there's nothing at stake in leaving one
// around disconnected indefinitely (it stops counting toward
// serializeRoom's spectatorCount, and can reconnect by token/userId later —
// see reconnectSpectator).
export function handleSocketDisconnect(room, socketId, onChange) {
  if (!room) return;
  const affectedSpectators = room.spectators.filter((s) => s.socketId === socketId);
  if (affectedSpectators.length > 0) {
    if (room.status === "lobby") {
      room.spectators = room.spectators.filter((s) => s.socketId !== socketId);
    } else {
      affectedSpectators.forEach((s) => {
        s.connected = false;
        s.socketId = null;
      });
    }
  }

  const affected = room.seats.filter((s) => s.socketId === socketId);
  if (affected.length === 0) {
    if (affectedSpectators.length > 0) onChange();
    return;
  }

  if (room.status === "lobby") {
    room.seats = room.seats.filter((s) => s.socketId !== socketId);
    if (room.hostSeatId && !room.seats.find((s) => s.id === room.hostSeatId)) {
      room.hostSeatId = room.seats[0]?.id ?? null;
    }
    if (room.seats.length === 0 && room.spectators.length === 0) rooms.delete(room.code);
    onChange();
    return;
  }

  // Mid-game, a disconnecting seat stays in room.seats (see the grace-period
  // prune below), but if it was the host's seat, the host role can't just
  // dangle on it — nothing else ever reassigns hostSeatId mid-game
  // (transferHost requires *being* host to call it), so a leaving host would
  // otherwise strand the room with no one able to act as host until they
  // personally reconnect. Mirrors the lobby branch above, just without
  // dropping the seat itself.
  if (room.hostSeatId && affected.some((s) => s.id === room.hostSeatId)) {
    const nextHost = room.seats.find((s) => !affected.includes(s) && s.connected);
    if (nextHost) room.hostSeatId = nextHost.id;
  }

  affected.forEach((seat) => {
    seat.connected = false;
    // Start (or, if somehow already running, leave alone) the clock for
    // the leaderboard's cumulative-disconnect rule — see reconnectSeats,
    // which stops it and folds the elapsed time into totalDisconnectedMs.
    // While this is set, the seat is auto-played like a bot (see
    // server.js's sweepTurnTimeouts) rather than stalling the round.
    if (!seat.disconnectedAt) seat.disconnectedAt = Date.now();
    clearDisconnectTimer(room, seat.id);
    const timer = setTimeout(() => {
      room.seats = room.seats.filter((s) => s.id !== seat.id);
      room.disconnectTimers.delete(seat.id);
      if (room.seats.every((s) => !s.connected) && room.spectators.every((s) => !s.connected)) {
        rooms.delete(room.code);
      }
      // The seat is gone from room.seats now, but room.game doesn't know
      // that — if it's still their turn, nothing could ever resolve it
      // again (the seat lookup in currentAutoTarget would just keep
      // failing), freezing the round forever. Resolve their game turn the
      // same way a host's manual removal already does.
      if (room.game && room.status === "playing") {
        room.game = removeSeatFromGame(room.game, seat.id);
      }
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

  // Seats were spaced out as they joined assuming the room would fill to
  // maxPlayers (see addSeats/fillWithBots) — a game that actually starts
  // with fewer seats (e.g. a matchmaking room's host starting early with
  // 2 of 4) needs to re-space them against the real final headcount now,
  // so 2 players land on opposite corners instead of wherever a 4-seat
  // spacing happened to leave them.
  room.seats.forEach((seat, i) => {
    seat.armIndex = armForSeatIndex(i, room.seats.length);
  });

  room.status = "playing";
  room.startedAt = new Date();
  room.game = createGame(room.seats.map((s) => ({ id: s.id, armIndex: s.armIndex })));
  return { room };
}

const DEFAULT_LIVE_MATCHES_LIMIT = 5;

// The seat furthest along by seatProgress (see engine.js) — null before
// anyone's left the yard, or on a tie, rather than picking an arbitrary
// "leader" that isn't really ahead of anyone.
function leadingSeatName(room) {
  if (!room.game) return null;
  const progresses = room.game.seats.map((gs) => ({ id: gs.id, progress: seatProgress(gs) }));
  const maxProgress = Math.max(0, ...progresses.map((p) => p.progress));
  if (maxProgress === 0) return null;
  const leaders = progresses.filter((p) => p.progress === maxProgress);
  if (leaders.length !== 1) return null;
  return room.seats.find((s) => s.id === leaders[0].id)?.name ?? null;
}

// Public, in-progress rooms for the home dashboard's "Live Matches" section
// (see src/app/api/live-matches/route.ts) — a room only shows up once its
// host has opted spectatePolicy to "public" (default is "private", see
// createRoom), so this never surfaces a room its host hasn't chosen to make
// discoverable. Ranked by spectatorCount (most-watched first) so the small
// capped list favors whatever's already drawing attention, tie-broken by
// startedAt (older/more-established games first).
export function listLiveMatches({ limit = DEFAULT_LIVE_MATCHES_LIMIT } = {}) {
  const eligible = [];
  for (const room of rooms.values()) {
    if (room.status !== "playing" || room.spectatePolicy !== "public") continue;
    eligible.push(room);
  }
  eligible.sort((a, b) => {
    const spectatorDiff =
      b.spectators.filter((s) => s.connected).length - a.spectators.filter((s) => s.connected).length;
    if (spectatorDiff !== 0) return spectatorDiff;
    return (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0);
  });
  return eligible.slice(0, limit).map((room) => ({
    code: room.code,
    // "matchmaking": auto-paired via Find Players Online (always a
    // signed-in host, see matchmaking:join in server.js). "guest": the
    // no-sign-in-needed Play with Bots flow (see CreateRoom.tsx's
    // handlePlayWithBots) — never has an invite link anyone would share, so
    // it's the other case that only reaches Live Matches by defaulting to
    // public on its own. "private": a signed-in host's own created room
    // that chose to make watching public.
    roomType: room.matchmaking ? "matchmaking" : hostUserId(room) ? "private" : "guest",
    maxPlayers: room.maxPlayers,
    humanCount: room.seats.filter((s) => !s.bot).length,
    botCount: room.seats.filter((s) => s.bot).length,
    spectatorCount: room.spectators.filter((s) => s.connected).length,
    elapsedMs: room.startedAt ? Date.now() - room.startedAt.getTime() : 0,
    leaderName: leadingSeatName(room),
  }));
}

export function serializeRoom(room) {
  return {
    code: room.code,
    maxPlayers: room.maxPlayers,
    hostSeatId: room.hostSeatId,
    status: room.status,
    sponsored: room.sponsored,
    matchmaking: !!room.matchmaking,
    // "private"/"public" (see setSpectatePolicy) — never who's actually
    // watching, just the live count, so a private room's watchers stay
    // anonymous to everyone but the host (who sees a name only transiently,
    // at approval time — see room:watchRequest:incoming in server.js).
    spectatePolicy: room.spectatePolicy,
    spectatorCount: room.spectators.filter((s) => s.connected).length,
    // Mid-game seats with no seat object left at all (see vacatedSeats) —
    // the host's only way to know an arm is fillable with a bot, since
    // there's no seat row anywhere else in this payload to show it.
    vacatedSeats: vacatedSeats(room),
    seats: room.seats.map((s) => ({
      id: s.id,
      name: s.name,
      armIndex: s.armIndex,
      deviceId: s.deviceId,
      connected: s.connected,
      profileId: s.profileId ?? null,
      bot: !!s.bot,
      simulated: !!s.simulated,
    })),
  };
}

export function serializeGame(room) {
  return room.game;
}
