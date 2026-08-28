import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPendingRequestCount, getDisplayName } from "@/lib/nav-data";
import AuthenticatedNav from "@/components/nav/AuthenticatedNav";
import LandingHero from "@/components/home/LandingHero";
import HomeDashboard, { type RecentRoom } from "@/components/home/HomeDashboard";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return <LandingHero />;

  const userId = session.user.id;
  const displayName = getDisplayName(session.user);

  const myProfileIds = (
    await prisma.userProfile.findMany({ where: { userId }, select: { profileId: true } })
  ).map((l) => l.profileId);

  // Two separate GamePlayer reads: `allPlayed` covers full history for the
  // stats tally (same "endedEarly non-winner doesn't count" rule as
  // src/app/leaderboard/page.tsx), while `recentPlayed` is a small,
  // most-recent-first slice (with a buffer, since a single game can appear
  // more than once here if the account seated more than one profile in it)
  // for the Recent Rooms list — same source src/app/history/page.tsx uses.
  const [allPlayed, recentPlayed, roomsCreated, pendingRequestCount] = await Promise.all([
    prisma.gamePlayer.findMany({
      where: { profileId: { in: myProfileIds } },
      include: { game: true },
    }),
    prisma.gamePlayer.findMany({
      where: { profileId: { in: myProfileIds } },
      include: { game: { include: { players: true } } },
      orderBy: { game: { endedAt: "desc" } },
      take: 10,
    }),
    prisma.usageEvent.count({ where: { userId, role: "HOST" } }),
    getPendingRequestCount(userId),
  ]);

  let gamesPlayed = 0;
  let gamesWon = 0;
  for (const p of allPlayed) {
    if (p.game.endedEarly && !p.isWinner) continue;
    gamesPlayed += 1;
    if (p.isWinner) gamesWon += 1;
  }
  const winRatePercent = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : null;

  const seenGameIds = new Set<string>();
  const recentRooms: RecentRoom[] = [];
  for (const gp of recentPlayed) {
    if (seenGameIds.has(gp.gameId)) continue;
    seenGameIds.add(gp.gameId);
    recentRooms.push({
      roomCode: gp.game.roomCode,
      playerCount: gp.game.players.length,
      maxPlayers: gp.game.maxPlayers,
      endedAt: gp.game.endedAt.toISOString(),
    });
    if (recentRooms.length >= 3) break;
  }

  return (
    <AuthenticatedNav
      displayName={displayName}
      email={session.user.email ?? null}
      userImage={session.user.image ?? null}
      pendingRequestCount={pendingRequestCount}
    >
      <HomeDashboard
        displayName={displayName}
        recentRooms={recentRooms}
        stats={{ gamesPlayed, gamesWon, winRatePercent, roomsCreated }}
      />
    </AuthenticatedNav>
  );
}
