import type { Metadata } from "next";
import MarketingShell from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What MyLudo collects, why, and how to reach us about it.",
  alternates: { canonical: "/privacy" },
  robots: { index: false, follow: true },
};

const LAST_UPDATED = "August 31, 2026";

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Last updated {LAST_UPDATED}
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Who this is</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          MyLudo is built and operated by an individual developer, not a
          company. Questions about this policy or your data can be sent to{" "}
          <a
            href="mailto:hello@myludo.life"
            className="text-accent hover:underline"
          >
            hello@myludo.life
          </a>
          .
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Playing as a guest</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          You can create or join a room without an account. In that case, a
          device identifier and any guest name you choose are stored only in
          your own browser&apos;s local storage — not on our servers — so you
          can rejoin your seat if you reload the page.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Signing in with Google</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          If you sign in, Google shares your name, email address, and profile
          image with us, which we store to create your account and a matching
          player profile. We use a session cookie to keep you signed in —
          nothing more is done with it.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">
          Gameplay and account data
        </h2>
        <p className="text-sm text-ink-muted sm:text-base">
          For signed-in accounts, we store the rooms you create or join, game
          results, friend connections you make, and usage data (like how many
          games you&apos;ve played) needed to apply the free daily allowance and
          any Game Pack or subscription fairly.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Payments</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Game Pack and subscription payments are handled by our payment
          processor, Uropai. We store the amount and status of each payment; we
          never see or store your card, UPI, or bank details — those go directly
          to Uropai.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Analytics</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          We use PostHog to understand how MyLudo is used in aggregate — which
          pages and features get used, not the contents of your games.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">What we don&apos;t do</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          No ads, no ad networks, and no selling your data to third parties.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Deleting your data</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Email{" "}
          <a
            href="mailto:hello@myludo.life"
            className="text-accent hover:underline"
          >
            hello@myludo.life
          </a>{" "}
          to have your account and associated data deleted.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Changes</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          This page may be updated as MyLudo changes. The date above reflects
          the most recent update.
        </p>
      </section>
    </MarketingShell>
  );
}
