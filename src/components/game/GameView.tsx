"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useGame } from "@/hooks/useGame";
import { rollDice as emitRollDice, moveToken as emitMoveToken } from "@/lib/socketActions";
import { colorForArm } from "@/game/board";
import Dice from "@/components/game/Dice";
import TurnBanner from "@/components/game/TurnBanner";
import Button from "@/components/ui/Button";
import type { Room } from "@/types/room";
import type { OwnedSeat } from "@/types/room";

// Konva needs a real <canvas>/window, so this can't run during SSR.
const Board = dynamic(() => import("@/components/game/Board"), {
  ssr: false,
  loading: () => <div className="aspect-square w-full max-w-lg mx-auto" />,
});

export default function GameView({ room, mySeats }: { room: Room; mySeats: OwnedSeat[] }) {
  const router = useRouter();
  const { game, currentSeat, currentRoomSeat, isMyTurn, validMoves } = useGame();

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

  const canRoll = isMyTurn && game.diceValue == null;

  const handleRoll = () => {
    if (!currentSeat || !canRoll) return;
    emitRollDice(room.code, currentSeat.id);
  };

  const handleTokenTap = (seatId: string, tokenIndex: number) => {
    emitMoveToken(room.code, seatId, tokenIndex);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-4">
      <TurnBanner currentSeat={currentSeat} currentRoomSeat={currentRoomSeat} isMyTurn={isMyTurn} mySeats={mySeats} />

      <Board
        game={game}
        isMyTurn={isMyTurn}
        currentSeatId={currentSeat?.id ?? null}
        validMoves={validMoves}
        onTokenTap={handleTokenTap}
      />

      <div className="flex items-center justify-center">
        <Dice value={game.diceValue} canRoll={canRoll} onRoll={handleRoll} />
      </div>
    </div>
  );
}
