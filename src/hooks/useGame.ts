"use client";

import { useMemo } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useRoomStore } from "@/store/useRoomStore";
import { getValidMoves } from "@/game/engine";

// Derived, render-friendly view of "whose turn is it, and does it belong to
// one of the seats this device controls" — the piece a shared/pass-and-play
// device needs to know who should be tapping the screen right now.
export function useGame() {
  const game = useGameStore((s) => s.game);
  const room = useRoomStore((s) => s.room);
  const mySeats = useRoomStore((s) => s.mySeats);

  return useMemo(() => {
    if (!game) return { game: null, currentSeat: null, currentRoomSeat: null, isMyTurn: false, validMoves: [] as number[] };

    const currentSeat = game.seats[game.currentSeatIndex] ?? null;
    const currentRoomSeat = room?.seats.find((s) => s.id === currentSeat?.id) ?? null;
    const isMyTurn = !!currentSeat && mySeats.some((s) => s.id === currentSeat.id);
    const validMoves = currentSeat && isMyTurn ? getValidMoves(game, currentSeat.id) : [];

    return { game, currentSeat, currentRoomSeat, isMyTurn, validMoves };
  }, [game, room, mySeats]);
}
