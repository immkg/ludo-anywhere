import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Play Ludo Across Devices",
  description:
    "Four players, four different phones — or one phone and three laptops. MyLudo doesn't force everyone onto the same device or all-separate devices; any mix works in the same room.",
  alternates: { canonical: "/cross-device-ludo" },
};

const EXAMPLES = [
  {
    title: "Everyone on their own phone",
    detail: "Each player joins from their own phone, wherever they are.",
  },
  {
    title: "One shared screen, some remote",
    detail:
      "Two people share a tablet in the living room while two friends join from their own phones elsewhere.",
  },
  {
    title: "Mixed devices, same room",
    detail:
      "A phone, a laptop, and a tablet — all in the same game, no two players needing matching hardware.",
  },
];

export default function CrossDeviceLudoPage() {
  return (
    <MarketingShell>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Play Ludo Across Any Mix of Devices
        </h1>
        <p className="mt-2 text-sm text-ink-muted sm:text-base">
          MyLudo doesn&apos;t care what device each player is on, or whether
          they match.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Why this matters</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Most online board games assume everyone plays the same way: all in one
          app on separate accounts, or all crowded around one screen. Real
          groups don&apos;t split that cleanly — some people are in the same
          room, some are joining remotely, and not everyone has the same phone
          or the same patience for installing something new. MyLudo is built
          around that: any combination of same-device and separate-device
          players can sit in one room together.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">
          How it actually plays out
        </h2>
        <ul className="flex flex-col gap-3">
          {EXAMPLES.map((example) => (
            <li
              key={example.title}
              className="rounded-2xl border border-line bg-surface p-4"
            >
              <h3 className="text-sm font-bold text-ink">{example.title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{example.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">What you need</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          A browser. That&apos;s it — no app to install, on any phone, tablet,
          or computer. One player creates a room and shares the link or room
          code; everyone else opens it in their own browser and joins. See{" "}
          <Link href="/how-to-play" className="text-accent hover:underline">
            how to play
          </Link>{" "}
          for the full walkthrough.
        </p>
      </section>
    </MarketingShell>
  );
}
