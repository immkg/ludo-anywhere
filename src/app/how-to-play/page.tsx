import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "How to Play",
  description:
    "How to create a room, invite friends, and play Ludo on MyLudo — from any device, no account required.",
  alternates: { canonical: "/how-to-play" },
};

const STEPS = [
  {
    title: "Create a room",
    detail:
      "Open MyLudo and start a room for 2 to 4 players. No sign-in needed to do this.",
  },
  {
    title: "Share the code or link",
    detail:
      "Every room gets a short code and a link. Send either to whoever you're playing with.",
  },
  {
    title: "Friends join from their own device",
    detail:
      "They open the link, or type the code into MyLudo, and pick a color — from a phone, tablet, or computer.",
  },
  {
    title: "Play",
    detail:
      "Roll, move your tokens around the board, and race the others home. See the full rules on the Ludo Rules page.",
  },
];

export default function HowToPlayPage() {
  return (
    <MarketingShell>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          How to Play MyLudo
        </h1>
        <p className="mt-2 text-sm text-ink-muted sm:text-base">
          Four steps, no account required to get started.
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-2xl border border-line bg-surface p-4"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-accent">
              {index + 1}
            </span>
            <div>
              <h2 className="text-sm font-bold text-ink">{step.title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Playing across devices</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Players don&apos;t need to match devices — some can share one screen
          while others join from their own phones. See{" "}
          <Link
            href="/cross-device-ludo"
            className="text-accent hover:underline"
          >
            playing across devices
          </Link>{" "}
          for how that works.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">
          Don&apos;t know Ludo yet?
        </h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Read the{" "}
          <Link href="/ludo-rules" className="text-accent hover:underline">
            rules of Ludo
          </Link>{" "}
          first — MyLudo plays the classic game.
        </p>
      </section>
    </MarketingShell>
  );
}
