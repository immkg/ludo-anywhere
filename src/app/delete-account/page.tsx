import type { Metadata } from "next";
import MarketingShell from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Delete Your Account",
  description: "How to request deletion of your MyLudo account and data.",
  alternates: { canonical: "/delete-account" },
  robots: { index: false, follow: true },
};

export default function DeleteAccountPage() {
  return (
    <MarketingShell>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Delete Your MyLudo Account
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Applies to accounts created by signing in with Google on MyLudo.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">How to request deletion</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Email{" "}
          <a
            href="mailto:hello@myludo.life?subject=Delete%20my%20MyLudo%20account"
            className="text-accent hover:underline"
          >
            hello@myludo.life
          </a>{" "}
          from the Google account you signed in with (or tell us the email
          address associated with your MyLudo account) and ask us to delete
          your account. We&apos;ll confirm once it&apos;s done, usually within
          7 days.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">What gets deleted</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Your account and player profile, friend connections, game and room
          history, and any credit balance or entitlement records tied to your
          account.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">What we keep</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          Payment records for any completed Game Pack or subscription
          purchases are kept as required for accounting and tax purposes,
          with your account association removed. Aggregate, non-identifying
          analytics (e.g. that a game was played, not by whom) are not tied
          back to a deleted account.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Guest play</h2>
        <p className="text-sm text-ink-muted sm:text-base">
          If you&apos;ve only ever played as a guest without signing in,
          there&apos;s no account to delete — your guest identifier lives only
          in your own browser&apos;s local storage, and clearing your
          browser&apos;s site data removes it.
        </p>
      </section>

      <p className="text-sm text-ink-muted sm:text-base">
        See also our{" "}
        <a href="/privacy" className="text-accent hover:underline">
          Privacy Policy
        </a>
        .
      </p>
    </MarketingShell>
  );
}
