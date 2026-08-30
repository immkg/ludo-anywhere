import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPendingRequestCount, getDisplayName } from "@/lib/nav-data";
import AuthenticatedNav from "@/components/nav/AuthenticatedNav";
import GuestNav from "@/components/nav/GuestNav";
import LeaderboardFilterBar from "@/components/leaderboard/LeaderboardFilterBar";
import LeaderboardRows, { type LeaderboardPlayer } from "@/components/leaderboard/LeaderboardRows";
import ScoringInfoPanel from "@/components/leaderboard/ScoringInfoPanel";
import { totalPoints } from "@/lib/scoring";
import { RANGE_OPTIONS, SCOPE_OPTIONS } from "@/components/leaderboard/leaderboardFilterOptions";

type Row = {
  id: string;
  name: string;
  email: string;
  wins: number;
  losses: number;
};

function rangeStartFor(range: string): Date | null {
  const now = new Date();
  if (range === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (range === "week") {
    const day = now.getDay(); // 0 = Sunday
    const diffToMonday = (day + 6) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    return start;
  }
  return null;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; scope?: string }>;
}) {
  const session = await auth();

  const { range: rawRange, scope: rawScope } = await searchParams;
  const range = RANGE_OPTIONS.some((o) => o.value === rawRange) ? rawRange! : "all";
  // "My players" needs an account to know which profiles are yours — a
  // guest always sees the global board, same as the leaderboard data itself
  // (it's public, unlike friends/history/profiles).
  const scope = session?.user && SCOPE_OPTIONS.some((o) => o.value === rawScope) ? rawScope! : "all";
  const rangeStart = rangeStartFor(range);

  const myEmail = session?.user?.email?.toLowerCase() ?? null;

  const [myLinks, players, pendingRequestCount] = await Promise.all([
    session?.user
      ? prisma.userProfile.findMany({ where: { userId: session.user.id }, select: { profileId: true } })
      : Promise.resolve([]),
    prisma.gamePlayer.findMany({
      where: {
        profileId: { not: null },
        ...(rangeStart ? { game: { endedAt: { gte: rangeStart } } } : {}),
      },
      include: { profile: true, game: true },
    }),
    session?.user ? getPendingRequestCount(session.user.id) : Promise.resolve(0),
  ]);

  const myProfileIds = new Set(myLinks.map((l) => l.profileId));

  const byProfile = new Map<string, Row>();
  for (const p of players) {
    if (!p.profile) continue;
    if (scope === "mine" && !myProfileIds.has(p.profileId as string)) continue;
    // A game the host ended early never resolved for whoever hadn't
    // already finished — no win, no loss, so it doesn't count as a game
    // played for them either (see engine.js's endGame).
    if (p.game.endedEarly && !p.isWinner) continue;

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

  const ranked: LeaderboardPlayer[] = Array.from(byProfile.values())
    .map((row) => ({ ...row, points: totalPoints(row.wins, row.losses) }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name))
    .map((row, i) => {
      const isMe = row.email.toLowerCase() === myEmail;
      return {
        id: row.id,
        rank: i + 1,
        name: row.name,
        email: row.email,
        image: isMe ? session?.user?.image ?? null : null,
        wins: row.wins,
        losses: row.losses,
        points: row.points,
        isMe,
      };
    });

  const content = (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 px-4 pb-10 pt-6 sm:gap-7 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Leaderboard</h1>
          <p className="mt-1 text-sm text-ink-muted sm:text-base">Top players ranked by total points.</p>
        </div>
        <LeaderboardFilterBar range={range} scope={scope} showScopeFilter={!!session?.user} />
      </div>

      <ScoringInfoPanel />

      {ranked.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="font-semibold text-ink">Nobody on the leaderboard yet.</p>
          <p className="mt-1 text-sm text-ink-muted">Play some games to start climbing.</p>
        </div>
      ) : (
        <LeaderboardRows players={ranked} />
      )}
    </main>
  );

  if (!session?.user) {
    return <GuestNav>{content}</GuestNav>;
  }

  return (
    <AuthenticatedNav
      displayName={getDisplayName(session.user)}
      email={session.user.email ?? null}
      userImage={session.user.image ?? null}
      pendingRequestCount={pendingRequestCount}
    >
      {content}
    </AuthenticatedNav>
  );
}
