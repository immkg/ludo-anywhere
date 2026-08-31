"use client";

import { useState } from "react";
import { IconStar } from "@/components/nav/icons";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const GOLD = "var(--color-accent-2)";

export type FeedbackContext = "GAME_FINISHED" | "LEFT_EARLY" | "GENERAL";

// GAME_FINISHED and GENERAL share one phrasing — it needs to read
// naturally both right after a game and opened cold from the nav, so it
// can't presume a game just happened. LEFT_EARLY stays distinct since
// that flow really is always game-specific.
const HEADING: Record<FeedbackContext, string> = {
  GAME_FINISHED: "How's MyLudo working out for you?",
  GENERAL: "How's MyLudo working out for you?",
  LEFT_EARLY: "Mind telling us why you left?",
};

// Always skippable — this is a light-touch prompt, not a gate. Where it's
// shown (and how often) is decided by the caller: always on an early
// leave, sampled on a normal finish (see GameView.tsx/GameMenu.tsx), or
// on demand from the nav (see FeedbackButton.tsx).
export default function FeedbackPrompt({
  context,
  gameId,
  onDone,
}: {
  context: FeedbackContext;
  gameId?: string;
  onDone?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"open" | "submitting" | "done">("open");

  if (state === "done") return null;

  const submit = async (skip: boolean) => {
    if (!skip && rating === 0 && !comment.trim()) {
      setState("done");
      onDone?.();
      return;
    }
    setState("submitting");
    if (!skip) {
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, gameId, rating: rating || null, comment: comment || null }),
      }).catch(() => {});
    }
    setState("done");
    onDone?.();
  };

  return (
    <div className="flex w-full max-w-xs flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
      <p className="text-sm font-semibold text-ink">{HEADING[context]}</p>
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className="h-7 w-7 p-1"
            style={{ color: n <= rating ? GOLD : "var(--color-line)" }}
          >
            <IconStar />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Any suggestions? (optional)"
        rows={1}
        className={cn(
          "w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink",
          "placeholder:text-ink-muted"
        )}
      />
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => submit(true)} disabled={state === "submitting"}>
          Skip
        </Button>
        <Button className="flex-1" onClick={() => submit(false)} disabled={state === "submitting"}>
          Send
        </Button>
      </div>
    </div>
  );
}
