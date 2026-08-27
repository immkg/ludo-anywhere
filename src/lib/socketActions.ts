import { getSocket } from "@/lib/socket";
import { getDeviceId } from "@/lib/identity";
import type { OwnedSeat } from "@/types/room";

export type SeatRequest = { profileId: string };
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

export function createRoom(maxPlayers: number, seats: SeatRequest[]) {
  return emitWithAck("room:create", { maxPlayers, seats, deviceId: getDeviceId() });
}

export function joinRoom(roomCode: string, seats: SeatRequest[], knownTokens: string[] = []) {
  return emitWithAck("room:join", {
    roomCode: roomCode.toUpperCase(),
    seats,
    knownTokens,
    deviceId: getDeviceId(),
  });
}

export function startGame(roomCode: string, seatId: string) {
  getSocket().emit("game:start", { roomCode, seatId });
}

export function rollDice(roomCode: string, seatId: string) {
  getSocket().emit("game:rollDice", { roomCode, seatId });
}

export function moveToken(roomCode: string, seatId: string, tokenIndex: number) {
  getSocket().emit("game:moveToken", { roomCode, seatId, tokenIndex });
}

export function leaveRoom(roomCode: string) {
  getSocket().emit("room:leave", { roomCode });
}

export function removeSeat(roomCode: string, seatId: string) {
  return emitWithAck("room:removeSeat", { roomCode, seatId });
}

export function suspendSeat(roomCode: string, seatId: string) {
  return emitWithAck("room:suspendSeat", { roomCode, seatId });
}

export function resumeSeat(roomCode: string, seatId: string) {
  return emitWithAck("room:resumeSeat", { roomCode, seatId });
}

export function transferHost(roomCode: string, toSeatId: string) {
  return emitWithAck("room:transferHost", { roomCode, toSeatId });
}

export function endGame(roomCode: string) {
  return emitWithAck("room:endGame", { roomCode });
}

export function claimSeat(roomCode: string, seatId: string, profileId: string) {
  return emitWithAck("room:claimSeat", { roomCode, seatId, profileId });
}

// Resolves to the new room's code once it's actually started — the seats
// themselves arrive separately via the room:rematchReady push (see
// useSocketConnection), same as an approved join.
export function rematch(roomCode: string) {
  return emitWithAck("room:rematch", { roomCode });
}

export function inviteFriendToRoom(roomCode: string, friendUserId: string) {
  return emitWithAck("room:invite", { roomCode, friendUserId });
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

export function refreshPresence(): Promise<{ presence: Record<string, { online: boolean; roomCode: string | null }> }> {
  return new Promise((resolve) => {
    getSocket().emit("presence:refresh", {}, resolve);
  });
}
