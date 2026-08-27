import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { colorForArm } from "@/game/board";
import Button from "@/components/ui/Button";

export default async function HistoryPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <p className="text-ink-muted">Sign in with Google on the home page to see your game history.</p>
        <Link href="/">
          <Button variant="secondary">Back home</Button>
        </Link>
      </main>
    );
  }

  const myProfileIds = (
    await prisma.userProfile.findMany({
      where: { userId: session.user.id },
      select: { profileId: true },
    })
  ).map((l) => l.profileId);

  const played = await prisma.gamePlayer.findMany({
    where: { profileId: { in: myProfileIds } },
    include: { game: { include: { players: true } } },
    orderBy: { game: { endedAt: "desc" } },
    take: 50,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Game history</h1>
        <Link href="/" className="text-sm font-semibold text-ink-muted underline">
          Home
        </Link>
      </div>

      {played.length === 0 ? (
        <p className="text-ink-muted">No finished games yet — play a room to see it here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {played.map((entry) => {
            const opponents = entry.game.players.filter((p) => p.seatId !== entry.seatId);
            const color = colorForArm(entry.armIndex);
            return (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
              >
                <span
                  className="h-9 w-9 shrink-0 rounded-full border border-line"
                  style={{ backgroundColor: color.hex }}
                  title={color.label}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    Room {entry.game.roomCode} · {entry.isWinner ? "Won" : "Lost"}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    vs {opponents.map((o) => o.name).join(", ") || "—"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ink-muted">
                  {entry.game.endedAt.toLocaleDateString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
