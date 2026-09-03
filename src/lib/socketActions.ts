import { getSocket } from "@/lib/socket";
import { getDeviceId } from "@/lib/identity";
import type { OwnedSeat, OwnedSpectator, SpectatePolicy } from "@/types/room";
import type { Reaction } from "@/components/game/ReactionPicker";

export type SeatRequest = { profileId: string };
// A signed-out joiner has no verified profile — just a chosen name (see
// resolveGuestSeats in src/server/profiles.js).
export type GuestSeatRequest = { name: string };
export type ClaimableSeat = { id: string; name: string };
// `pending` means the join needs host approval — see room:join in
// server.js. `seats` is absent until room:joinApproved arrives later.
// `midGame` means the room's already playing — nothing was joined; pick
// one of `claimableSeats` and call claimSeat() instead. `spectator` is only
// ever set by room:watch (see watchRoom below).
type Ack = {
  error?: string;
  roomCode?: string;
  seats?: OwnedSeat[];
  pending?: boolean;
  midGame?: boolean;
  claimableSeats?: ClaimableSeat[];
  spectator?: OwnedSpectator;
};

const ACK_TIMEOUT_MS = 12_000;

function emitWithAck(event: string, payload: unknown): Promise<Ack> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for a response to "${event}". Please try again.`));
    }, ACK_TIMEOUT_MS);
    getSocket().emit(event, payload, (ack: Ack) => {
      clearTimeout(timer);
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

// Host-only, mid-game: fills a paused/removed/disconnected/fully-vacated
// seat with a bot (see room:addBot in server.js) — `seatId` can be one of
// `Room.vacatedSeats`' ids as well as a normal seat's. Pulling the bot back
// out later is just removeSeat() above, same as removing any other seat.
export function addBotToSeat(roomCode: string, seatId: string, hostSeatId: string) {
  return emitWithAck("room:addBot", { roomCode, seatId, callerSeatId: hostSeatId });
}

// Joins as a spectator — no seat, just a live viewer. Resolves once this
// device is either watching outright (`spectator` set, a "public" room or a
// successful reconnect) or waiting on host approval (`pending`, a "private"
// room — see room:watchRequest:incoming/room:watchApproved).
export function watchRoom(roomCode: string, name: string, knownTokens: string[] = []) {
  return emitWithAck("room:watch", {
    roomCode: roomCode.toUpperCase(),
    name,
    knownTokens,
    deviceId: getDeviceId(),
  });
}

export function approveWatchRequest(roomCode: string, toUserId: string) {
  return emitWithAck("room:watchRequest:approve", { roomCode, toUserId });
}

export function declineWatchRequest(roomCode: string, toUserId: string) {
  getSocket().emit("room:watchRequest:decline", { roomCode, toUserId });
}

// Host-only — same seatId-based proof of host-ness as fillBotSeats/
// suspendSeat (a guest host has no account for a cookie-based check).
export function setSpectatePolicy(roomCode: string, policy: SpectatePolicy, hostSeatId: string) {
  return emitWithAck("room:setSpectatePolicy", { roomCode, policy, callerSeatId: hostSeatId });
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

// Asks the host of an in-progress room to seat the caller — from the home
// dashboard's Live Matches "Join", so no seatId is picked up front (see
// room:midGameJoinRequest in server.js): unlike claimSeat, the host chooses
// which open seat or active bot to hand over at approval time.
export function requestMidGameJoin(roomCode: string) {
  return emitWithAck("room:midGameJoinRequest", { roomCode });
}

export function approveMidGameJoinRequest(roomCode: string, toUserId: string, targetSeatId: string) {
  return emitWithAck("room:midGameJoinRequest:approve", { roomCode, toUserId, targetSeatId });
}

export function declineMidGameJoinRequest(roomCode: string, toUserId: string) {
  getSocket().emit("room:midGameJoinRequest:decline", { roomCode, toUserId });
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
// `targetSeatId` (from a per-player sticker button — see PlayerCorner.tsx)
// pins the reaction to that seat's home on the board instead of the usual
// center-screen pop. `fromName` is only ever set for a quick-chat phrase
// (see handleReact in GameView.tsx) — an emoji/sticker reaction stays
// anonymous, same as before.
export function sendReaction(roomCode: string, reaction: Reaction, targetSeatId?: string, fromName?: string) {
  getSocket().emit("game:reaction", { roomCode, reaction, targetSeatId, fromName });
}

// Free-text spectator-only chat (see spectator:chat:send in server.js) —
// deliberately not sendReaction/game:reaction, so it never lands in the
// players' own reaction/quick-chat stream. Rejects (via emitWithAck) with
// the server's validation error — too long, empty, or too fast — so
// SpectatorChat.tsx can show it inline instead of silently dropping it.
export function sendSpectatorChat(roomCode: string, text: string) {
  return emitWithAck("spectator:chat:send", { roomCode, text });
}
