"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { IconSmiley, IconPalette } from "@/components/game/gameIcons";
import ReactionPicker, { type Reaction } from "@/components/game/ReactionPicker";

// A small floating bar with just the two reaction triggers — tapping one
// opens a picker of options, selecting one shows it briefly over the board
// (see GameView.tsx). Not tied to any player seat.
export default function ReactionBar({ onReact }: { onReact: (reaction: Reaction) => void }) {
  const [openPicker, setOpenPicker] = useState<"emoji" | "sticker" | null>(null);

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
    </div>
  );
}
