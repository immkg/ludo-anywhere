import type { Metadata } from "next";
import MarketingShell from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using MyLudo.",
  alternates: { canonical: "/terms" },
  robots: { index: false, follow: true },
};

const LAST_UPDATED = "August 31, 2026";

export default function TermsPage() {
  return (
    <MarketingShell>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Last updated {LAST_UPDATED}
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Using MyLudo</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          MyLudo is built and operated by an individual developer. By creating
          or joining a room, with or without an account, you agree to these
          terms. Contact{" "}
          <a
            href="mailto:hello@myludo.life"
            className="text-accent hover:underline"
          >
            hello@myludo.life
          </a>{" "}
          with any questions.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Accounts</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          You can play as a guest, or sign in with Google to keep your player
          profile, stats, and friends. You&apos;re responsible for whatever
          happens under your account.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Fair use</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Don&apos;t use MyLudo to harass other players, attempt to disrupt the
          service, or access it through automated means outside the normal game
          client. We can suspend or remove access for accounts that do.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Payments</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          A free daily allowance of games is available to everyone. Game Packs
          and subscriptions are optional paid upgrades, priced as shown at the
          time of purchase and processed by our payment provider, Uropai.
          Contact{" "}
          <a
            href="mailto:hello@myludo.life"
            className="text-accent hover:underline"
          >
            hello@myludo.life
          </a>{" "}
          about a specific payment.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">No ads</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          MyLudo does not and will not show advertising.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Provided as-is</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          MyLudo is provided as-is, without guaranteed uptime or availability.
          To the extent allowed by law, we&apos;re not liable for losses arising
          from using or being unable to use it.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Changes</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          These terms may be updated as MyLudo changes. The date above reflects
          the most recent update.
        </p>
      </section>
    </MarketingShell>
  );
}
