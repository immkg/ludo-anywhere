import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPendingRequestCount, getDisplayName } from "@/lib/nav-data";
import AuthenticatedNav from "@/components/nav/AuthenticatedNav";

type Row = { id: string; name: string; email: string; games: number; wins: number };

export default async function LeaderboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const [players, pendingRequestCount] = await Promise.all([
    prisma.gamePlayer.findMany({
      where: { profileId: { not: null } },
      include: { profile: true, game: true },
    }),
    getPendingRequestCount(session.user.id),
  ]);

  const byProfile = new Map<string, Row>();
  for (const p of players) {
    if (!p.profile) continue;
    // A game the host ended early never resolved for whoever hadn't
    // already finished — no win, no loss, so it doesn't count as a game
    // played for them either (see engine.js's endGame).
    if (p.game.endedEarly && !p.isWinner) continue;

    const row = byProfile.get(p.profileId as string) ?? {
      id: p.profileId as string,
      name: p.profile.name,
      email: p.profile.email,
      games: 0,
      wins: 0,
    };
    row.games += 1;
    if (p.isWinner) row.wins += 1;
    byProfile.set(p.profileId as string, row);
  }

  const rows = Array.from(byProfile.values()).sort((a, b) => b.wins - a.wins || b.games - a.games);

  return (
    <AuthenticatedNav
      displayName={getDisplayName(session.user)}
      email={session.user.email ?? null}
      userImage={session.user.image ?? null}
      pendingRequestCount={pendingRequestCount}
    >
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">Leaderboard</h1>
          <Link href="/" className="text-sm font-semibold text-ink-muted underline">
            Home
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="text-ink-muted">No finished games yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row, i) => (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
              >
                <span className="w-6 shrink-0 text-center text-sm font-bold text-ink-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {row.games} played · {row.wins} won · {row.games - row.wins} lost
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AuthenticatedNav>
  );
}
