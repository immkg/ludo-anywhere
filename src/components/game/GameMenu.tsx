"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { endGame as emitEndGame, trackShare } from "@/lib/socketActions";
import { shareRoomLink, roomJoinUrl } from "@/lib/share";
import Button from "@/components/ui/Button";
import ThemeToggle from "@/components/ThemeToggle";

// Room-wide controls, opened from the "more" button in ReactionBar —
// distinct from a per-seat player menu (there isn't one on this screen).
export default function GameMenu({
  roomCode,
  isHost,
  hostSeatId,
  canEndGame,
  onLeaveGame,
  onClose,
}: {
  roomCode: string;
  isHost: boolean;
  hostSeatId: string | null;
  // See canEndGame in GameView.tsx — false only for a matchmaking host with
  // a real opponent still seated, who can leave but not end outright.
  canEndGame: boolean;
  onLeaveGame: () => void;
  onClose: () => void;
}) {
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [endGameLoading, setEndGameLoading] = useState(false);
  const [endGameError, setEndGameError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const reduceMotion = useReducedMotion();

  const handleInvite = async () => {
    trackShare("room_shared", { roomCode });
    const url = roomJoinUrl(roomCode);
    const result = await shareRoomLink(`Join my Ludo room on MyLudo! ${url}`, url);
    if (result === "copied") {
      setInviteCopied(true);
      setTimeout(() => {
        setInviteCopied(false);
        onClose();
      }, 1200);
      return;
    }
    onClose();
  };

  const handleEndGame = async () => {
    setEndGameLoading(true);
    setEndGameError(null);
    try {
      await emitEndGame(roomCode, hostSeatId!);
      onClose();
    } catch (e) {
      setEndGameError(e instanceof Error ? e.message : "Could not end the game");
    } finally {
      setEndGameLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center"
        onClick={onClose}
      >
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <p className="font-semibold">Game menu</p>
            <button onClick={onClose} className="text-sm font-semibold text-ink-muted underline">
              Close
            </button>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-muted">Theme</p>
            <ThemeToggle />
          </div>

          {confirmingEnd ? (
            <>
              <p className="text-sm text-ink-muted">
                {canEndGame
                  ? "Play stops for everyone right away. It’s saved to history but doesn’t count as a win or loss for anyone who hasn’t already finished."
                  : "You'll leave the game — it continues for the other players."}
              </p>
              {endGameError && <p className="text-sm text-accent">{endGameError}</p>}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmingEnd(false)} disabled={endGameLoading}>
                  Cancel
                </Button>
                <Button onClick={canEndGame ? handleEndGame : onLeaveGame} disabled={endGameLoading}>
                  {canEndGame ? (endGameLoading ? "Ending…" : "End game") : "Leave"}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleInvite}
                className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-accent"
              >
                {inviteCopied ? "Link copied!" : "Invite"}
              </button>
              {isHost && (
                <button
                  onClick={() => setConfirmingEnd(true)}
                  className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-accent"
                >
                  {canEndGame ? "End game" : "Leave game"}
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-ink-muted"
              >
                Go back
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
