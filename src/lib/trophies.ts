// Pure XP/tier math — no DB dependency, so it's trivial to unit test and
// safe to call from anywhere. XP is deliberately monotonic (never
// decreases): unlike the competitive leaderboard's totalPoints() (which
// docks points for a loss), this is meant to read as a journey, not a rank
// you can slip on — participation always earns something, wins earn more.
export type TrophyTier = {
  level: number;
  name: string;
  minXp: number;
  image: string;
};

// Tunable thresholds — a reasonable ramp (~1.6-1.8x per tier), not derived
// from real usage data yet. Revisit once there's a real XP distribution to
// calibrate against.
export const TROPHY_TIERS: TrophyTier[] = [
  { level: 1, name: "Wooden Pawn", minXp: 0, image: "/brand/trophy-1.png" },
  { level: 2, name: "Bronze Roller", minXp: 100, image: "/brand/trophy-2.png" },
  { level: 3, name: "Silver Roller", minXp: 250, image: "/brand/trophy-3.png" },
  { level: 4, name: "Gold Roller", minXp: 500, image: "/brand/trophy-4.png" },
  { level: 5, name: "Sapphire Champion", minXp: 900, image: "/brand/trophy-5.png" },
  { level: 6, name: "Emerald Champion", minXp: 1500, image: "/brand/trophy-6.png" },
  { level: 7, name: "Ruby Champion", minXp: 2500, image: "/brand/trophy-7.png" },
  { level: 8, name: "Diamond Champion", minXp: 4000, image: "/brand/trophy-8.png" },
  { level: 9, name: "Ludo Legend", minXp: 6000, image: "/brand/trophy-9.png" },
];

export function computeXp({
  gamesWon,
  gamesPlayed,
  playTimeHours,
}: {
  gamesWon: number;
  gamesPlayed: number;
  playTimeHours: number;
}): number {
  return gamesWon * 50 + gamesPlayed * 10 + Math.round(playTimeHours * 5);
}

// XP contributed by a single just-finished game — used on the results
// screen (see GameView.tsx) to show "XP earned this game" without waiting
// for a fresh page load's totals. Mirrors the exact counting rule
// src/app/page.tsx applies when folding a GamePlayer row into the
// lifetime totals fed to computeXp: playtime always counts, but a game
// that ended early only counts toward gamesWon/gamesPlayed if this seat
// won it anyway (an early loss doesn't count as "played"). Because
// computeXp is linear, calling it with just this game's own numbers gives
// exactly this game's own share of the total (modulo the total's single
// final Math.round, which this can't reproduce exactly — an acceptable
// approximation for an in-the-moment callout).
export function computeGameXp({
  isWinner,
  endedEarly,
  playTimeHours,
}: {
  isWinner: boolean;
  endedEarly: boolean;
  playTimeHours: number;
}): number {
  const countsAsPlayed = isWinner || !endedEarly;
  return computeXp({
    gamesWon: isWinner ? 1 : 0,
    gamesPlayed: countsAsPlayed ? 1 : 0,
    playTimeHours,
  });
}

export function getTrophyTier(xp: number): TrophyTier {
  let tier = TROPHY_TIERS[0];
  for (const t of TROPHY_TIERS) {
    if (xp >= t.minXp) tier = t;
  }
  return tier;
}

export function nextTrophyTier(xp: number): TrophyTier | null {
  const currentIndex = TROPHY_TIERS.findIndex((t) => t.level === getTrophyTier(xp).level);
  return TROPHY_TIERS[currentIndex + 1] ?? null;
}
