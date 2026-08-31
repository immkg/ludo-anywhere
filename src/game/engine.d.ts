import type { GameState } from "@/types/game";

export const DICE_HOLD_MS: number;
// [autoRollMs, autoMoveMs] per inactivity level — see timeoutsForLevel.
export const INACTIVITY_TIMEOUTS_MS: readonly (readonly [number, number])[];
export function timeoutsForLevel(level: number | undefined): readonly [number, number];
export function createGame(seats: { id: string; armIndex: number }[]): GameState;
export function getCurrentSeat(state: GameState): GameState["seats"][number] | null;
export function getValidMoves(state: GameState, seatId: string): number[];
export function pickAutoMoveToken(state: GameState, seatId: string): number | null;
export function rollDice(state: GameState): GameState;
export function moveToken(state: GameState, seatId: string, tokenIndex: number): GameState;
export function placementFor(state: GameState, seatId: string): number | null;
export function suspendSeat(state: GameState, seatId: string): GameState;
export function removeSeatFromGame(state: GameState, seatId: string): GameState;
export function reactivateSeat(state: GameState, seatId: string): GameState;
export function resetInactivity(state: GameState, seatId: string): GameState;
export function advanceInactivity(state: GameState, seatId: string): GameState;
export function endGame(state: GameState, options?: { declareWinner?: boolean }): GameState;
