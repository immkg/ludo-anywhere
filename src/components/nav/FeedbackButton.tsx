"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconStar } from "@/components/nav/icons";
import FeedbackPrompt from "@/components/game/FeedbackPrompt";

const GOLD = "var(--color-accent-2)";

// Always-available nav entry point for feedback/feature requests — the
// in-game FeedbackPrompt (see GameView.tsx/GameMenu.tsx) only surfaces
// after a specific game, this makes it reachable any time.
export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2/60"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4"
          style={{ backgroundColor: "color-mix(in srgb, " + GOLD + " 15%, transparent)", color: GOLD }}
        >
          <IconStar />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">Feedback</span>
      </button>

      {/* Portalled to <body> — opened from AccountSheet's bottom sheet,
          whose motion.div carries a live `transform` (framer-motion keeps
          it applied even at rest). That transform makes it a containing
          block for descendant `position: fixed` elements, which would
          otherwise confine this modal inside the sheet instead of
          centering it in the viewport. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : undefined}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
                onClick={() => setOpen(false)}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <FeedbackPrompt context="GENERAL" onDone={() => setOpen(false)} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
