import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "About",
  description:
    "MyLudo is a browser-based Ludo game built by one developer for playing with friends and family — no app, no ads, ever.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          About MyLudo
        </h1>
        <p className="mt-2 text-sm text-ink-muted sm:text-base">
          Why this exists, and what it does and doesn&apos;t do.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Why MyLudo</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          MyLudo started as a personal itch: wanting to play Ludo with friends
          and family without everyone needing the same app, the same device, or
          an account. It&apos;s built and run by one developer, not a company.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">What it is</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          A browser-based Ludo game for 2 to 4 players. Create a room, share the
          link or code, and play — from the same device, from separate devices,
          or any mix of both. Nobody needs an account to play; signing in with
          Google is optional and just saves your players and stats.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">How it makes money</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          MyLudo has no ads, and never will. Everyone gets a number of free
          games per day. Beyond that, you can buy a Game Pack or subscribe for
          unlimited play. That&apos;s the entire monetization model — see{" "}
          <Link href="/pricing" className="text-accent hover:underline">
            Pricing
          </Link>{" "}
          for details.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">The code</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          MyLudo&apos;s source is public on{" "}
          <a
            href="https://github.com/immkg/ludo-anywhere"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            GitHub
          </a>
          .
        </p>
      </section>
    </MarketingShell>
  );
}
