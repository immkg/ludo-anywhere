"use client";

import { useEffect, useState } from "react";
import type { LiveMatchSummary } from "@/types/room";

const POLL_MS = 7000;

// Polls the home dashboard's "Live Matches" list. Paused (interval kept
// running, fetch skipped) while the tab is hidden, so backgrounded
// dashboard tabs don't keep hitting the server every few seconds.
export function useLiveMatches() {
  const [matches, setMatches] = useState<LiveMatchSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (document.hidden) return;
      fetch("/api/live-matches")
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) setMatches(data.matches ?? []);
        })
        .catch(() => {});
    };

    load();
    const interval = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  return matches;
}
