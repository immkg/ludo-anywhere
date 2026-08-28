"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import PlayerAvatar from "@/components/lobby/PlayerAvatar";
import { IconChevronDown } from "@/components/home/icons";
import { cn } from "@/lib/utils";

export type HistoryPlayerResult = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  rank: number | null;
  rankLabel: string | null;
};

// Restrained per-rank accents (never the only signal — the ordinal text
// carries the meaning so ranking stays readable without color).
function rankBadgeClasses(rank: number | null) {
  if (rank === 1) return "bg-accent-2/20 text-accent-2"; // gold
  if (rank === 2) return "border border-line bg-surface-2 text-ink"; // cool neutral
  if (rank === 3) return "bg-accent/10 text-accent"; // warm bronze
  return "bg-surface-2 text-ink-muted";
}

export default function GameHistoryCard({
  date,
  players,
  endedEarly,
}: {
  date: string;
  players: HistoryPlayerResult[];
  endedEarly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full flex-col gap-4 p-4 text-left sm:p-5"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-bold text-ink sm:text-base">{date}</p>
          <IconChevronDown
            className={cn("h-5 w-5 shrink-0 text-ink-muted transition-transform", expanded && "rotate-180")}
          />
        </div>
        <div className="flex flex-wrap justify-start gap-x-2 gap-y-3 sm:gap-x-6 sm:gap-y-4">
          {players.map((p) => {
            const label = endedEarly ? "Ended early" : p.rankLabel;
            return (
              <div key={p.id} className="flex w-14 flex-col items-center gap-1">
                <PlayerAvatar name={p.name} email={p.email} image={p.image} size="sm" />
                {label && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-center text-[11px] font-bold",
                      endedEarly ? "bg-surface-2 text-ink-muted" : rankBadgeClasses(p.rank)
                    )}
                  >
                    {label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-line px-4 pb-4 pt-4 sm:px-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted">Results</p>
              <ul className="flex flex-col gap-1">
                {players.map((p, i) => {
                  const label = endedEarly ? "Ended early" : p.rankLabel;
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                      <span className="w-4 shrink-0 text-sm font-semibold text-ink-muted">{i + 1}</span>
                      <PlayerAvatar name={p.name} email={p.email} image={p.image} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.name}</span>
                      {label && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                            endedEarly ? "bg-surface-2 text-ink-muted" : rankBadgeClasses(p.rank)
                          )}
                        >
                          {label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
