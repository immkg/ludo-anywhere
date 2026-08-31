import { prisma } from "@/lib/prisma";
import { totalPoints } from "@/lib/scoring";

export type TopPlayer = {
  id: string;
  name: string;
  email: string;
  wins: number;
  losses: number;
  points: number;
};

// All-time, all-players, top N — the small preview shown on the home/guest
// dashboards. The full filterable (date range / mine-vs-all scope)
// leaderboard lives in src/app/leaderboard/page.tsx; this is intentionally
// a separate, simpler query rather than a shared abstraction, since that
// page's filtering doesn't apply to a fixed-size preview.
export async function getTopPlayers(limit: number): Promise<TopPlayer[]> {
  const players = await prisma.gamePlayer.findMany({
    where: { profileId: { not: null } },
    include: { profile: true, game: true },
  });

  const byProfile = new Map<string, { id: string; name: string; email: string; wins: number; losses: number }>();
  for (const p of players) {
    if (!p.profile) continue;
    // No placement recorded means no result for this seat — same
    // "doesn't count as a game played" rule as the full leaderboard page
    // (see engine.js's endGame and rooms.js's MIN_DURATION_FOR_EARLY_RESULT_MS/
    // MIN_ROLLS_FOR_EARLY_RESULT).
    if (p.placement == null) continue;

    const row = byProfile.get(p.profileId as string) ?? {
      id: p.profileId as string,
      name: p.profile.name,
      email: p.profile.email,
      wins: 0,
      losses: 0,
    };
    if (p.isWinner) row.wins += 1;
    else row.losses += 1;
    byProfile.set(p.profileId as string, row);
  }

  return Array.from(byProfile.values())
    .map((row) => ({ ...row, points: totalPoints(row.wins, row.losses) }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name))
    .slice(0, limit);
}
