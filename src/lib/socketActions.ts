import { getSocket } from "@/lib/socket";
import { getDeviceId } from "@/lib/identity";
import type { OwnedSeat } from "@/types/room";
import type { Reaction } from "@/components/game/ReactionPicker";

export type SeatRequest = { profileId: string };
// A signed-out joiner has no verified profile — just a chosen name (see
// resolveGuestSeats in src/server/profiles.js).
export type GuestSeatRequest = { name: string };
export type ClaimableSeat = { id: string; name: string };
// `pending` means the join needs host approval — see room:join in
// server.js. `seats` is absent until room:joinApproved arrives later.
// `midGame` means the room's already playing — nothing was joined; pick
// one of `claimableSeats` and call claimSeat() instead.
type Ack = {
  error?: string;
  roomCode?: string;
  seats?: OwnedSeat[];
  pending?: boolean;
  midGame?: boolean;
  claimableSeats?: ClaimableSeat[];
};

function emitWithAck(event: string, payload: unknown): Promise<Ack> {
  return new Promise((resolve, reject) => {
    getSocket().emit(event, payload, (ack: Ack) => {
      if (ack?.error) reject(new Error(ack.error));
      else resolve(ack);
    });
  });
}

export function createRoom(maxPlayers: number, seats: SeatRequest[] | GuestSeatRequest[]) {
  return emitWithAck("room:create", { maxPlayers, seats, deviceId: getDeviceId() });
}

// A guest host has no account/profile — same "just a chosen name" shape as
// joinRoomAsGuest (see resolveGuestSeats in src/server/profiles.js). Always
// exactly one seat; everyone else fills in from the lobby (bots, or a
// friend who joins the room code) same as a signed-in host.
export function createRoomAsGuest(maxPlayers: number, name: string) {
  return createRoom(maxPlayers, [{ name }]);
}

export function joinRoom(
  roomCode: string,
  seats: SeatRequest[] | GuestSeatRequest[],
  knownTokens: string[] = []
) {
  return emitWithAck("room:join", {
    roomCode: roomCode.toUpperCase(),
    seats,
    knownTokens,
    deviceId: getDeviceId(),
  });
}

export function joinRoomAsGuest(roomCode: string, name: string, knownTokens: string[] = []) {
  return joinRoom(roomCode, [{ name }], knownTokens);
}

export function startGame(roomCode: string, seatId: string) {
  getSocket().emit("game:start", { roomCode, seatId });
}

// `style` is purely a presentation hint (see Dice.tsx's "flick" throw) —
// the server relays it to everyone else in the room (game:diceThrow) so
// the flourish is consistent, but never lets it affect the actual roll.
export function rollDice(roomCode: string, seatId: string, style: "tap" | "flick" = "tap") {
  getSocket().emit("game:rollDice", { roomCode, seatId, style });
}

export function moveToken(roomCode: string, seatId: string, tokenIndex: number) {
  getSocket().emit("game:moveToken", { roomCode, seatId, tokenIndex });
}

export function leaveRoom(roomCode: string) {
  getSocket().emit("room:leave", { roomCode });
}

// `callerSeatId` (the caller's own seat) is only consulted server-side when
// there's no cookie session — a guest has no account to check host-ness or
// "is this my own seat" against, so it proves both the same way fillBots
// proves host-ness: by seatId, not a cookie.
export function removeSeat(roomCode: string, seatId: string, callerSeatId?: string) {
  return emitWithAck("room:removeSeat", { roomCode, seatId, callerSeatId });
}

// Host-only, lobby-only: fills every remaining open seat with a bot (see
// room:fillBots in server.js) — no seats to hand back, room:update carries
// the new roster same as any other join. Host-ness is proven by seatId
// (same as game:start), not a cookie — a guest host has no account to
// check against.
export function fillBotSeats(roomCode: string, hostSeatId: string) {
  return emitWithAck("room:fillBots", { roomCode, seatId: hostSeatId });
}

// Host-only — seatId is the caller's OWN (host) seat, same proof fillBots
// uses; a guest host has no account for a cookie-based check.
export function suspendSeat(roomCode: string, seatId: string, hostSeatId: string) {
  return emitWithAck("room:suspendSeat", { roomCode, seatId, callerSeatId: hostSeatId });
}

export function resumeSeat(roomCode: string, seatId: string, hostSeatId: string) {
  return emitWithAck("room:resumeSeat", { roomCode, seatId, callerSeatId: hostSeatId });
}

export function transferHost(roomCode: string, toSeatId: string, hostSeatId: string) {
  return emitWithAck("room:transferHost", { roomCode, toSeatId, callerSeatId: hostSeatId });
}

export function endGame(roomCode: string, hostSeatId: string) {
  return emitWithAck("room:endGame", { roomCode, seatId: hostSeatId });
}

export function claimSeat(roomCode: string, seatId: string, profileId: string) {
  return emitWithAck("room:claimSeat", { roomCode, seatId, profileId });
}

// Resolves to the new room's code once it's actually started — the seats
// themselves arrive separately via the room:rematchReady push (see
// useSocketConnection), same as an approved join.
export function rematch(roomCode: string, hostSeatId: string) {
  return emitWithAck("room:rematch", { roomCode, seatId: hostSeatId });
}

export function inviteFriendToRoom(roomCode: string, friendUserId: string) {
  return emitWithAck("room:invite", { roomCode, friendUserId });
}

// Fire-and-forget, same shape as declineJoinRequest — lets the inviter see
// "Rejected" instead of an invite that looks permanently pending.
export function declineRoomInvite(roomCode: string, hostUserId: string) {
  getSocket().emit("room:invite:decline", { roomCode, hostUserId });
}

// Fire-and-forget analytics for a share-button tap — no ack, since the UI
// never needs to know whether it landed. `type` must be one of the values
// server.js's TRACKABLE_EVENTS allowlists, or the server just drops it.
export function trackShare(type: "room_shared" | "invite_link_shared", properties?: Record<string, unknown>) {
  getSocket().emit("analytics:track", { type, properties });
}

export function requestToJoinRoom(roomCode: string) {
  return emitWithAck("room:joinRequest", { roomCode });
}

export function approveJoinRequest(roomCode: string, toUserId: string) {
  return emitWithAck("room:joinRequest:approve", { roomCode, toUserId });
}

export function declineJoinRequest(roomCode: string, toUserId: string) {
  getSocket().emit("room:joinRequest:decline", { roomCode, toUserId });
}

// Random-opponent matchmaking: joins the shared pool (always a 4-seat
// room — see matchmaking.js). Resolves the same shape as createRoom, so
// callers reuse the same navigate-into-room flow.
export function findMatch(seats: SeatRequest[]) {
  return emitWithAck("matchmaking:join", { seats, deviceId: getDeviceId() });
}

// Ephemeral nudges — the host still has to act via their own Start/Fill
// Bots buttons, this just surfaces a toast asking them to.
export function requestStart(roomCode: string, fromName: string) {
  getSocket().emit("room:requestStart", { roomCode, fromName });
}

export function requestBotFill(roomCode: string, fromName: string) {
  getSocket().emit("room:requestBotFill", { roomCode, fromName });
}

export function refreshPresence(): Promise<{ presence: Record<string, { online: boolean; roomCode: string | null }> }> {
  return new Promise((resolve) => {
    getSocket().emit("presence:refresh", {}, resolve);
  });
}

// Ephemeral, fire-and-forget — the sender already shows it locally
// (GameView.tsx), this just relays it to everyone else in the room.
export function sendReaction(roomCode: string, reaction: Reaction) {
  getSocket().emit("game:reaction", { roomCode, reaction });
}
