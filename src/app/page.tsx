import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPendingRequestCount, getDisplayName } from "@/lib/nav-data";
import { getTopPlayers } from "@/lib/leaderboard";
import { computeXp, getTrophyTier, nextTrophyTier } from "@/lib/trophies";
import AuthenticatedNav from "@/components/nav/AuthenticatedNav";
import LandingHero from "@/components/home/LandingHero";
import HomeDashboard from "@/components/home/HomeDashboard";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return <LandingHero />;

  const userId = session.user.id;
  const displayName = getDisplayName(session.user);

  const myProfileIds = (
    await prisma.userProfile.findMany({ where: { userId }, select: { profileId: true } })
  ).map((l) => l.profileId);

  const [allPlayed, roomsCreated, friendsCount, pendingRequestCount, topPlayers] = await Promise.all([
    prisma.gamePlayer.findMany({
      where: { profileId: { in: myProfileIds } },
      include: { game: true },
    }),
    prisma.usageEvent.count({ where: { userId, role: "HOST" } }),
    prisma.friendship.count({
      where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    }),
    getPendingRequestCount(userId),
    getTopPlayers(5),
  ]);

  let gamesPlayed = 0;
  let gamesWon = 0;
  let playTimeMs = 0;
  for (const p of allPlayed) {
    // Counted for every seated row regardless of endedEarly/isWinner — time
    // actually spent isn't conditional on whether the game "counts" for
    // win-rate purposes.
    playTimeMs += Math.max(0, p.game.endedAt.getTime() - p.game.startedAt.getTime());
    if (p.game.endedEarly && !p.isWinner) continue;
    gamesPlayed += 1;
    if (p.isWinner) gamesWon += 1;
  }
  const winRatePercent = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : null;
  const playTimeHours = Math.round((playTimeMs / 3_600_000) * 10) / 10;

  // Derived entirely from the numbers above — no extra query.
  const xp = computeXp({ gamesWon, gamesPlayed, playTimeHours });
  const trophy = getTrophyTier(xp);
  const nextTrophy = nextTrophyTier(xp);

  return (
    <AuthenticatedNav
      displayName={displayName}
      email={session.user.email ?? null}
      userImage={session.user.image ?? null}
      pendingRequestCount={pendingRequestCount}
    >
      <HomeDashboard
        displayName={displayName}
        topPlayers={topPlayers}
        stats={{ gamesPlayed, gamesWon, winRatePercent, roomsCreated, friendsCount, playTimeHours }}
        trophy={trophy}
        nextTrophy={nextTrophy}
        xp={xp}
      />
    </AuthenticatedNav>
  );
}
