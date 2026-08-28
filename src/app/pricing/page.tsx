import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { logEvent } from "@/lib/entitlements";
import { trackUmami } from "@/server/umami.js";
import { getPendingRequestCount, getDisplayName } from "@/lib/nav-data";
import AuthenticatedNav from "@/components/nav/AuthenticatedNav";
import PricingPageClient from "@/components/pricing/PricingPageClient";

export default async function PricingPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  logEvent("pricing_viewed", session.user.id);
  trackUmami("pricing_viewed", {}, session.user.id);

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
