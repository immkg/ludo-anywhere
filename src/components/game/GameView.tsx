"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useGame } from "@/hooks/useGame";
import { rollDice as emitRollDice, moveToken as emitMoveToken } from "@/lib/socketActions";
import { colorForArm } from "@/game/board";
import { pickAutoMoveToken } from "@/game/engine";
import Dice from "@/components/game/Dice";
import PlayerCorner from "@/components/game/PlayerCorner";
import Button from "@/components/ui/Button";
import type { Room, Seat } from "@/types/room";

// Konva needs a real <canvas>/window, so this can't run during SSR.
const Board = dynamic(() => import("@/components/game/Board"), {
  ssr: false,
  loading: () => <div className="aspect-square w-full max-w-lg mx-auto" />,
});

const AUTO_MOVE_MS = 15000;

export default function GameView({ room }: { room: Room }) {
  const router = useRouter();
  const { game, currentSeat, isMyTurn, validMoves } = useGame();

  // If a player doesn't tap a token in time, move one for them: prefer a
  // capture, then a move that lands safe, then the token furthest along
  // (closest to home). Resets whenever the game state actually changes
  // (a roll, a move) so it only ever fires after 15s of real inactivity.
  useEffect(() => {
    if (!isMyTurn || !currentSeat || !game || game.diceValue == null || validMoves.length === 0) {
      return;
    }
    const seatId = currentSeat.id;
    const roomCode = room.code;
    const timer = setTimeout(() => {
      const tokenIndex = pickAutoMoveToken(game, seatId);
      if (tokenIndex != null) emitMoveToken(roomCode, seatId, tokenIndex);
    }, AUTO_MOVE_MS);
    return () => clearTimeout(timer);
  }, [isMyTurn, currentSeat, game, validMoves, room.code]);

  if (!game) {
    return <div className="flex min-h-dvh items-center justify-center text-ink-muted">Loading game…</div>;
  }

  if (game.status === "finished") {
    const winnerRoomSeat = room.seats.find((s) => s.id === game.winnerSeatId);
    const winnerGameSeat = game.seats.find((s) => s.id === game.winnerSeatId);
    const color = winnerGameSeat ? colorForArm(winnerGameSeat.armIndex) : null;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8 text-center"
      >
        {color && <span className="h-16 w-16 rounded-full" style={{ backgroundColor: color.hex }} />}
        <div>
          <p className="text-ink-muted">Winner</p>
          <h2 className="text-3xl font-extrabold">{winnerRoomSeat?.name ?? "A player"}</h2>
        </div>
        <Button onClick={() => router.push("/")}>Back home</Button>
      </motion.div>
    );
  }

  // Board corners: arm 0 = top-left, arm 1 = top-right, arm 2 = bottom-right,
  // arm 3 = bottom-left (see armForSeatIndex in src/game/board.js).
  const seatByArm = new Map<number, Seat>(room.seats.map((s) => [s.armIndex, s]));

  const canRoll = isMyTurn && game.diceValue == null;
  const canMove = isMyTurn && game.diceValue != null && validMoves.length > 0;

  const handleRoll = () => {
    if (!currentSeat || !canRoll) return;
    emitRollDice(room.code, currentSeat.id);
  };

  const handleTokenTap = (seatId: string, tokenIndex: number) => {
    emitMoveToken(room.code, seatId, tokenIndex);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-4">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between px-1">
        <PlayerCorner seat={seatByArm.get(0) ?? null} avatarFirst isTurn={seatByArm.get(0)?.id === currentSeat?.id} />
        <PlayerCorner
          seat={seatByArm.get(1) ?? null}
          avatarFirst={false}
          isTurn={seatByArm.get(1)?.id === currentSeat?.id}
        />
      </div>

      <Board
        game={game}
        isMyTurn={isMyTurn}
        currentSeatId={currentSeat?.id ?? null}
        validMoves={validMoves}
        onTokenTap={handleTokenTap}
      />

      {/* Konva draws to a <canvas>, which carries no semantics of its own,
          so screen readers need this separate text description of which
          tokens (if any) can currently be tapped. */}
      <p className="sr-only" aria-live="polite">
        {isMyTurn && validMoves.length > 0
          ? `Your turn: ${validMoves.length} token${validMoves.length === 1 ? "" : "s"} can move now.`
          : isMyTurn
            ? "Your turn: roll the dice."
            : ""}
      </p>

      <div className="mx-auto flex w-full max-w-lg items-center justify-between px-1">
        <PlayerCorner seat={seatByArm.get(3) ?? null} avatarFirst isTurn={seatByArm.get(3)?.id === currentSeat?.id} />
        <PlayerCorner
          seat={seatByArm.get(2) ?? null}
          avatarFirst={false}
          isTurn={seatByArm.get(2)?.id === currentSeat?.id}
        />
      </div>

      <div className="flex items-center justify-center">
        <Dice
          lastRoll={game.lastRoll}
          rollSeq={game.rollSeq}
          canRoll={canRoll}
          onRoll={handleRoll}
          canMove={canMove}
          color={currentSeat ? colorForArm(currentSeat.armIndex).hex : "#2B2016"}
        />
      </div>
    </div>
  );
}
