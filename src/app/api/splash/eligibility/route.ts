import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveCoupon } from "@/lib/coupons";

// Called once when a client-side trigger signal (session count, pages
// browsed, minutes played, games completed, or leaving /pricing without
// buying — see src/lib/splashTriggers.ts) fires, before the flash-discount
// splash is allowed to mount. Two things make a user ineligible, and both
// are permanent for that user — there's no second chance this session or
// any other:
//
// 1. They've already been shown it before. The updateMany's WHERE guard
//    (rather than a plain read-then-write) makes "first one wins" atomic
//    across concurrent tabs/requests, so it can't be shown twice via a
//    race.
// 2. They already hold another active coupon (e.g. a referral reward) —
//    issuing a flash coupon would silently void it (see issueCoupon in
//    src/lib/coupons.ts), so the splash is suppressed rather than
//    cannibalizing an existing perk. Still counts as "shown" — simplest
//    rule, avoids re-litigating this later.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const claimed = await prisma.user.updateMany({
    where: { id: session.user.id, upgradeSplashShownAt: null },
    data: { upgradeSplashShownAt: new Date() },
  });
  if (claimed.count === 0) return NextResponse.json({ eligible: false });

  const existingCoupon = await getActiveCoupon(session.user.id);
  if (existingCoupon) return NextResponse.json({ eligible: false });

  return NextResponse.json({ eligible: true });
}
