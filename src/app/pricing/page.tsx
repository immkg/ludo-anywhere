import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { logEvent } from "@/lib/entitlements";
import { trackUmami } from "@/server/umami.js";
import PricingPageClient from "@/components/pricing/PricingPageClient";

export default async function PricingPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  logEvent("pricing_viewed", session.user.id);
  trackUmami("pricing_viewed", {}, session.user.id);

  return <PricingPageClient />;
}
