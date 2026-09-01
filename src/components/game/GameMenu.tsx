"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { endGame as emitEndGame, trackShare } from "@/lib/socketActions";
import { shareRoomLink, roomJoinUrl } from "@/lib/share";
import { colorForArm } from "@/game/board";
import Button from "@/components/ui/Button";
import ThemeToggle from "@/components/ThemeToggle";
import CosmeticsPicker from "@/components/CosmeticsPicker";
import FeedbackPrompt from "@/components/game/FeedbackPrompt";
import InviteFriendsList from "@/components/friends/InviteFriendsList";
import type { Seat } from "@/types/room";

// Room-wide controls, opened from the "more" button in ReactionBar — also
// where the host manages individual players (pause/resume/remove/make
// host — see the Players list below, which opens PlayerActionsModal in
// GameView.tsx for whichever seat is tapped). That used to be a tap on the
// player's own card instead, but sitting right next to the dice slot made
// it an easy mistap while trying to roll — see PlayerCorner.tsx.
export default function GameMenu({
  roomCode,
  isHost,
  hostSeatId,
  seats,
  canEndGame,
  openSeatCount,
  onLeaveGame,
  onManagePlayer,
  onClose,
}: {
  roomCode: string;
  isHost: boolean;
  hostSeatId: string | null;
  seats: Seat[];
  // See canEndGame in GameView.tsx — false only for a matchmaking host with
  // a real opponent still seated, who can leave but not end outright.
  canEndGame: boolean;
  // How many seats are actually open to invite a friend into right now —
  // paused or removed-and-unclaimed (see claimableSeatCount in
  // src/game/engine.js). Gates the "Invite a friend" list below: sending
  // the invite itself always works (see room:invite in server.js), but
  // there's nothing for them to actually join until a seat frees up.
  openSeatCount: number;
  onLeaveGame: () => void;
  // Host-only — opens PlayerActionsModal for the tapped seat (see
  // GameView.tsx).
  onManagePlayer: (seatId: string) => void;
  onClose: () => void;
}) {
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [endGameLoading, setEndGameLoading] = useState(false);
  const [endGameError, setEndGameError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showLeaveFeedback, setShowLeaveFeedback] = useState(false);
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

          {/* Free cosmetic customization (token style/board finish/dice
              skin) — issues #23/#29. Placed here, right below Theme, since
              there's no dedicated settings/profile screen yet and this is
              the same kind of per-client, local-only, always-visible
              preference Theme already is. Worth revisiting if a settings
              screen shows up later. */}
          <CosmeticsPicker />

          {showLeaveFeedback ? (
            <FeedbackPrompt context="LEFT_EARLY" gameId={roomCode} onDone={onLeaveGame} />
          ) : confirmingEnd ? (
            <>
              <p className="text-sm text-ink-muted">
                {canEndGame
                  ? "Play stops for everyone right away. If the game's gone on long enough, results are saved as a real win/loss for everyone based on the board right now — otherwise it's saved as unresolved for anyone who hasn't already finished."
                  : "You'll leave the game — it continues for the other players."}
              </p>
              {endGameError && <p className="text-sm text-accent">{endGameError}</p>}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmingEnd(false)} disabled={endGameLoading}>
                  Cancel
                </Button>
                <Button
                  onClick={canEndGame ? handleEndGame : () => setShowLeaveFeedback(true)}
                  disabled={endGameLoading}
                >
                  {canEndGame ? (endGameLoading ? "Ending…" : "End game") : "Leave"}
                </Button>
              </div>
            </>
          ) : (
            <>
              {isHost && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-ink-muted">Players</p>
                  <div className="flex flex-col gap-1">
                    {seats.map((seat) => (
                      <button
                        key={seat.id}
                        onClick={() => onManagePlayer(seat.id)}
                        className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-left text-sm font-semibold text-ink transition hover:bg-surface-2"
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: colorForArm(seat.armIndex).hex }}
                        />
                        <span className="min-w-0 flex-1 truncate">{seat.name}</span>
                        {seat.id === hostSeatId && <span className="text-xs font-normal text-ink-muted">Host</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Invite a specific online friend straight into this room
                  (see InviteFriendsList) — distinct from the room-code
                  Invite button below, which just shares a generic link.
                  Only useful once a seat has actually opened up (a paused
                  or removed player — see openSeatCount above), so it's
                  hidden rather than shown disabled the rest of the time. */}
              {isHost && openSeatCount > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-ink-muted">Invite a friend into the open seat</p>
                  <InviteFriendsList roomCode={roomCode} />
                </div>
              )}

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
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
