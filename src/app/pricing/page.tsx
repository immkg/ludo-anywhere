import { auth } from "@/lib/auth";
import { logEvent } from "@/lib/entitlements";
import { trackPosthog } from "@/server/posthog.js";
import { getPendingRequestCount, getDisplayName } from "@/lib/nav-data";
import AuthenticatedNav from "@/components/nav/AuthenticatedNav";
import GuestNav from "@/components/nav/GuestNav";
import SignInTeaser from "@/components/nav/SignInTeaser";
import PricingPageClient from "@/components/pricing/PricingPageClient";

export default async function PricingPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <GuestNav>
        <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 pb-10 pt-6 sm:gap-7 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Pricing</h1>
            <p className="mt-1 text-sm text-ink-muted sm:text-base">More games, more players, no limits.</p>
          </div>
          <SignInTeaser
            title="See plans and pricing"
            subtitle="Sign in to see game packs and subscription plans, and pick what works for you."
            source="pricing"
          />
        </main>
      </GuestNav>
    );
  }

  logEvent("pricing_viewed", session.user.id);
  trackPosthog("pricing_viewed", {}, session.user.id);

  const pendingRequestCount = await getPendingRequestCount(session.user.id);

  return (
    <AuthenticatedNav
      displayName={getDisplayName(session.user)}
      email={session.user.email ?? null}
      userImage={session.user.image ?? null}
      pendingRequestCount={pendingRequestCount}
    >
      <PricingPageClient />
    </AuthenticatedNav>
  );
}
