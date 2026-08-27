import { getSocket } from "@/lib/socket";
import { getDeviceId } from "@/lib/identity";
import type { OwnedSeat } from "@/types/room";

export type SeatRequest = { profileId: string };
type Ack = { error?: string; roomCode?: string; seats?: OwnedSeat[] };

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
