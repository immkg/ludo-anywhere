"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import PlayerAvatar from "@/components/lobby/PlayerAvatar";
import { IconChevronDown } from "@/components/home/icons";
import { GREEN, RED } from "@/components/nav/navItems";
import { WIN_POINTS, LOSS_POINTS } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import RankBadge from "./RankBadge";

export type LeaderboardPlayer = {
  id: string;
  rank: number;
  name: string;
  email: string;
  image: string | null;
  wins: number;
  losses: number;
  points: number;
  isMe: boolean;
};

function formatSigned(n: number) {
  return n >= 0 ? `+${n.toLocaleString()}` : `−${Math.abs(n).toLocaleString()}`;
}

export default function LeaderboardRows({ players }: { players: LeaderboardPlayer[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  return (
    <>
      {/* Mobile / tablet: accordion list. Desktop table needs real column
          width to stay legible (see spec's "layout capacity" breakpoint),
          so the switch is at lg (1024px), not the usual sm/md. */}
      <ul className="flex flex-col gap-2 lg:hidden">
        {players.map((p) => {
          const expanded = expandedId === p.id;
          const winPoints = p.wins * WIN_POINTS;
          const lossPoints = p.losses * LOSS_POINTS;
          return (
            <li
              key={p.id}
              className={cn(
                "overflow-hidden rounded-2xl border border-line bg-surface",
                p.isMe && "ring-1 ring-accent/40"
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : p.id)}
                aria-expanded={expanded}
                className="flex min-h-[44px] w-full items-center gap-3 p-3 text-left"
              >
                <RankBadge rank={p.rank} />
                <PlayerAvatar name={p.name} email={p.email} image={p.image} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {p.name}
                    {p.isMe && <span className="ml-1.5 text-xs font-bold text-accent">(You)</span>}
                  </p>
                  <p className="truncate text-xs text-ink-muted">{p.email}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-base font-extrabold text-ink">{p.points.toLocaleString()}</span>
                  <span className="text-[11px] text-ink-muted">pts</span>
                </div>
                <IconChevronDown
                  className={cn("h-4 w-4 shrink-0 text-ink-muted transition-transform", expanded && "rotate-180")}
                />
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
                    <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-ink">Wins</span>
                        <span className="text-right">
                          <span className="block text-sm font-bold" style={{ color: GREEN }}>
                            {p.wins.toLocaleString()}
                          </span>
                          <span className="block text-xs font-semibold" style={{ color: GREEN }}>
                            {formatSigned(winPoints)}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-ink">Losses</span>
                        <span className="text-right">
                          <span className="block text-sm font-bold" style={{ color: RED }}>
                            {p.losses.toLocaleString()}
                          </span>
                          <span className="block text-xs font-semibold" style={{ color: RED }}>
                            {formatSigned(lossPoints)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      {/* Desktop: full table. */}
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-ink-muted">
              <th scope="col" className="w-16 px-4 py-3">
                Rank
              </th>
              <th scope="col" className="px-4 py-3">
                Player
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Wins <span className="font-medium normal-case text-ink-muted">(+{WIN_POINTS} each)</span>
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Losses <span className="font-medium normal-case text-ink-muted">({LOSS_POINTS} each)</span>
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Total Points
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className={cn("border-b border-line last:border-0", p.isMe && "bg-accent/5")}>
                <td className="px-4 py-3">
                  <RankBadge rank={p.rank} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <PlayerAvatar name={p.name} email={p.email} image={p.image} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">
                        {p.name}
                        {p.isMe && <span className="ml-1.5 text-xs font-bold text-accent">(You)</span>}
                      </p>
                      <p className="truncate text-xs text-ink-muted">{p.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="block font-bold" style={{ color: GREEN }}>
                    {p.wins.toLocaleString()}
                  </span>
                  <span className="block text-xs font-semibold" style={{ color: GREEN }}>
                    {formatSigned(p.wins * WIN_POINTS)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="block font-bold" style={{ color: RED }}>
                    {p.losses.toLocaleString()}
                  </span>
                  <span className="block text-xs font-semibold" style={{ color: RED }}>
                    {formatSigned(p.losses * LOSS_POINTS)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-base font-extrabold text-ink">
                  {p.points.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
