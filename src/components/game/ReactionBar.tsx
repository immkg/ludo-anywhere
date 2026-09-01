"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconSmiley, IconPalette, IconKebab } from "@/components/game/gameIcons";
import { IconChat } from "@/components/friends/icons";
import ReactionPicker, { type Reaction } from "@/components/game/ReactionPicker";

// A small floating bar of game-wide controls (not tied to any player seat):
// the three reaction triggers (emoji, sticker, quick-chat phrase), an
// End/Leave shortcut (one click + a confirm, instead of burying the
// most-reached-for action in the "more" menu), and "more" for the
// room-wide Game Menu (see GameMenu.tsx, opened by GameView).
export default function ReactionBar({
  onReact,
  onMore,
  isHost,
  canEndGame,
  onEndGame,
  onLeaveGame,
}: {
  onReact: (reaction: Reaction) => void;
  onMore: () => void;
  isHost: boolean;
  // Whether the host is allowed to end the game outright vs. only leave it
  // (a matchmaking host with a real opponent still seated can only leave —
  // see canEndGame in GameView.tsx). Irrelevant for a non-host, who can
  // only ever leave.
  canEndGame: boolean;
  onEndGame: () => void;
  onLeaveGame: () => void;
}) {
  const [openPicker, setOpenPicker] = useState<"emoji" | "sticker" | "chat" | "confirm" | null>(null);
  const reduceMotion = useReducedMotion();
  const showEnd = isHost && canEndGame;

  return (
    <div className="relative flex items-center gap-1 rounded-2xl border border-line bg-surface px-1.5 py-1 shadow-sm">
      <div className="relative">
        <button
          onClick={() => setOpenPicker(openPicker === "emoji" ? null : "emoji")}
          aria-label="Emojis"
          aria-expanded={openPicker === "emoji"}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <IconSmiley className="h-5 w-5" />
        </button>
        <AnimatePresence>
          {openPicker === "emoji" && (
            <ReactionPicker mode="emoji" onSelect={onReact} onClose={() => setOpenPicker(null)} />
          )}
        </AnimatePresence>
      </div>

      <div className="relative">
        <button
          onClick={() => setOpenPicker(openPicker === "sticker" ? null : "sticker")}
          aria-label="Stickers"
          aria-expanded={openPicker === "sticker"}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <IconPalette className="h-5 w-5" />
        </button>
        <AnimatePresence>
          {openPicker === "sticker" && (
            <ReactionPicker mode="sticker" onSelect={onReact} onClose={() => setOpenPicker(null)} />
          )}
        </AnimatePresence>
      </div>

      <div className="relative">
        <button
          onClick={() => setOpenPicker(openPicker === "chat" ? null : "chat")}
          aria-label="Quick chat"
          aria-expanded={openPicker === "chat"}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <IconChat className="h-5 w-5" />
        </button>
        <AnimatePresence>
          {openPicker === "chat" && (
            <ReactionPicker mode="chat" onSelect={onReact} onClose={() => setOpenPicker(null)} />
          )}
        </AnimatePresence>
      </div>

      <button
        onClick={() => setOpenPicker(openPicker === "confirm" ? null : "confirm")}
        aria-label={showEnd ? "End game" : "Leave game"}
        aria-expanded={openPicker === "confirm"}
        className="flex min-h-11 items-center justify-center rounded-xl px-2.5 text-sm font-bold text-accent transition hover:bg-accent/10"
      >
        {showEnd ? "End" : "Leave"}
      </button>
      {/* A real viewport-centered modal (matching GameMenu.tsx/
          PlayerActionsModal), not an anchored dropdown off this button —
          the button sits off-center in this bar, so `absolute`-anchoring
          the confirm here landed it left-of-center on narrow screens
          instead of actually centering it. */}
      <AnimatePresence>
        {openPicker === "confirm" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={() => setOpenPicker(null)}
          >
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-lg"
              role="menu"
            >
              <p className="text-sm text-ink-muted">
                {showEnd
                  ? "Play stops for everyone right away."
                  : isHost
                    ? "You'll leave the game — it continues for the other players."
                    : "You'll be paused — the host can let you back in."}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setOpenPicker(null)}
                  className="flex-1 rounded-xl border border-line py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setOpenPicker(null);
                    if (showEnd) onEndGame();
                    else onLeaveGame();
                  }}
                  className="flex-1 rounded-xl bg-accent py-2 text-sm font-bold text-white"
                >
                  {showEnd ? "End game" : "Leave"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={onMore}
        aria-label="More options"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <IconKebab className="h-5 w-5" />
      </button>
    </div>
  );
}
