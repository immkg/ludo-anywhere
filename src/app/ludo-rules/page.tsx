import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Ludo Rules",
  description:
    "The rules of Ludo, in plain language — how tokens move, capture, and win.",
  alternates: { canonical: "/ludo-rules" },
};

export default function LudoRulesPage() {
  return (
    <MarketingShell>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Ludo Rules
        </h1>
        <p className="mt-2 text-sm text-ink-muted sm:text-base">
          The classic game, in plain language.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">The goal</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Ludo is played by 2 to 4 players, each with four tokens of one color.
          Whoever gets all four of their tokens all the way around the board and
          into home first wins.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">
          Getting a token onto the board
        </h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Your tokens start off the board, in your base. You need to roll a six
          to bring one onto the board — until then, all you can do is wait for a
          six.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Moving</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          On your turn, roll the die and move one of your tokens that many
          squares forward along the shared track. Each color&apos;s track
          eventually turns off into that color&apos;s own home stretch, which no
          other color can enter.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Capturing</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Land exactly on a square occupied by an opponent&apos;s token and you
          send it back to their base — they have to roll another six to bring it
          out again. Certain squares are marked safe: tokens can&apos;t be
          captured while sitting on one, even with several tokens of different
          colors stacked together.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Extra turns</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Rolling a six, capturing an opponent&apos;s token, or getting a token
          all the way home each earn you another roll immediately. Roll three
          sixes in a row, though, and your turn is forfeited instead — the
          six-streak resets and play passes to the next player.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Winning</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          The first player to get all four of their tokens into their home
          stretch wins the game.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Play it</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Ready to try it with friends? See{" "}
          <Link href="/how-to-play" className="text-accent hover:underline">
            how to play on MyLudo
          </Link>
          .
        </p>
      </section>
    </MarketingShell>
  );
}
