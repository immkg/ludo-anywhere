import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPendingRequestCount, getDisplayName } from "@/lib/nav-data";
import AuthenticatedNav from "@/components/nav/AuthenticatedNav";
import GuestNav from "@/components/nav/GuestNav";
import SignInTeaser from "@/components/nav/SignInTeaser";
import Button from "@/components/ui/Button";
import HistoryFilterBar from "@/components/history/HistoryFilterBar";
import { RANGE_OPTIONS } from "@/components/history/historyFilterOptions";
import GameHistoryCard, { type HistoryPlayerResult } from "@/components/history/GameHistoryCard";

const DEFAULT_LIMIT = 10;
const LOAD_MORE_STEP = 10;
const MAX_CANDIDATE_GAMES = 200;

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function rangeStartFor(range: string): Date | null {
  const days = Number(range);
  if (!Number.isFinite(days) || days <= 0) return null;
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; player?: string; limit?: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    return (
      <GuestNav>
        <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 pb-10 pt-6 sm:gap-7 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Game History</h1>
            <p className="mt-1 text-sm text-ink-muted sm:text-base">
              Games played by you and the players on your devices.
            </p>
          </div>
          <SignInTeaser
            title="Keep a record of every game"
            subtitle="Sign in to see your past games, results, and placements."
            source="history"
          />
        </main>
      </GuestNav>
    );
  }

  const { range: rawRange, player: rawPlayer, limit: rawLimit } = await searchParams;
  const range = RANGE_OPTIONS.some((o) => o.value === rawRange) ? rawRange! : "all";
  const limit = Math.max(DEFAULT_LIMIT, Number(rawLimit) || DEFAULT_LIMIT);

  const myEmail = session.user.email?.toLowerCase() ?? null;

  const [myLinks, pendingRequestCount] = await Promise.all([
    prisma.userProfile.findMany({
      where: { userId: session.user.id },
      include: { profile: { select: { id: true, name: true, email: true } } },
    }),
    getPendingRequestCount(session.user.id),
  ]);

  const myProfiles = myLinks.map((l) => l.profile);
  const myProfileIds = myProfiles.map((p) => p.id);
  const meProfile = myProfiles.find((p) => p.email.toLowerCase() === myEmail) ?? null;

  const filterablePlayers = [
    ...(meProfile ? [meProfile] : []),
    ...myProfiles.filter((p) => p.id !== meProfile?.id).sort((a, b) => a.name.localeCompare(b.name)),
  ];

  const selectedPlayerId = filterablePlayers.some((p) => p.id === rawPlayer) ? rawPlayer! : "all";
  const profileFilterIds = selectedPlayerId === "all" ? myProfileIds : [selectedPlayerId];
  const rangeStart = rangeStartFor(range);

  const matchingGamePlayers =
    profileFilterIds.length === 0
      ? []
      : await prisma.gamePlayer.findMany({
          where: {
            profileId: { in: profileFilterIds },
            ...(rangeStart ? { game: { endedAt: { gte: rangeStart } } } : {}),
          },
          select: { gameId: true },
          distinct: ["gameId"],
          orderBy: { game: { endedAt: "desc" } },
          take: MAX_CANDIDATE_GAMES,
        });

  const allGameIds = matchingGamePlayers.map((g) => g.gameId);
  const pageGameIds = allGameIds.slice(0, limit);
  const hasMore = allGameIds.length > limit;

  const games =
    pageGameIds.length === 0
      ? []
      : await prisma.game.findMany({
          where: { id: { in: pageGameIds } },
          include: {
            players: {
              include: { profile: { select: { id: true, name: true, email: true } } },
            },
          },
        });

  const gamesById = new Map(games.map((g) => [g.id, g]));
  const orderedGames = pageGameIds.map((id) => gamesById.get(id)).filter((g): g is NonNullable<typeof g> => Boolean(g));

  const cards = orderedGames.map((game) => {
    const sortedPlayers = [...game.players].sort((a, b) => {
      const ap = a.placement ?? Infinity;
      const bp = b.placement ?? Infinity;
      if (ap !== bp) return ap - bp;
      if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const players: HistoryPlayerResult[] = sortedPlayers.map((gp) => {
      const isMe = gp.profileId != null && gp.profileId === meProfile?.id;
      const rankLabel = gp.placement != null ? ordinal(gp.placement) : gp.isWinner ? "Won" : null;
      return {
        id: gp.id,
        name: isMe ? "You" : gp.profile?.name ?? gp.name,
        email: gp.profile?.email ?? gp.name,
        image: isMe ? session.user.image ?? null : null,
        rank: gp.placement,
        rankLabel,
      };
    });

    return {
      id: game.id,
      date: game.endedAt.toLocaleString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      endedEarly: game.endedEarly,
      players,
    };
  });

  const filtersActive = range !== "all" || selectedPlayerId !== "all";

  return (
    <AuthenticatedNav
      displayName={getDisplayName(session.user)}
      email={session.user.email ?? null}
      userImage={session.user.image ?? null}
      pendingRequestCount={pendingRequestCount}
    >
      <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 pb-10 pt-6 sm:gap-7 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Game History</h1>
            <p className="mt-1 text-sm text-ink-muted sm:text-base">
              Games played by you and the players on your devices.
            </p>
          </div>
          <HistoryFilterBar players={filterablePlayers} range={range} player={selectedPlayerId} />
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-ink-muted">All games</h2>

          {cards.length === 0 ? (
            <p className="text-ink-muted">
              {filtersActive ? "No games match these filters." : "No finished games yet — play a room to see it here."}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {cards.map((card) => (
                  <li key={card.id}>
                    <GameHistoryCard date={card.date} players={card.players} endedEarly={card.endedEarly} />
                  </li>
                ))}
              </ul>

              {hasMore && (
                <Link
                  href={`?${new URLSearchParams({
                    ...(range !== "all" ? { range } : {}),
                    ...(selectedPlayerId !== "all" ? { player: selectedPlayerId } : {}),
                    limit: String(limit + LOAD_MORE_STEP),
                  }).toString()}`}
                  className="self-center"
                >
                  <Button variant="secondary" className="min-h-10 px-4 text-sm">
                    Load more
                  </Button>
                </Link>
              )}
            </>
          )}
        </section>

        <p className="text-center text-xs text-ink-muted">Games are private and only visible to you.</p>
      </main>
    </AuthenticatedNav>
  );
}
