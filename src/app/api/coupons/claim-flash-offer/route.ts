import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveCoupon, issueCoupon } from "@/lib/coupons";

const FLASH_OFFER_MS = 5 * 60 * 1000;
const CAMPAIGN_KEY_FOR_PLAN = { PACK: "flash_game_pack", MONTHLY: "flash_monthly" } as const;
type FlashPlan = keyof typeof CAMPAIGN_KEY_FOR_PLAN;

// Called when the user picks a specific plan on the flash-discount splash
// (signed-in), or right after landing back on /pricing?claim=1 post-login
// (the guest path — see DiscountSplash.tsx). Issues that plan's coupon with
// a real 5-minute deadline starting now, not whenever the splash first
// rendered — see the plan doc's "Where the real deadline actually starts".
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const plan = body?.plan as FlashPlan | undefined;
  if (!plan || !(plan in CAMPAIGN_KEY_FOR_PLAN)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // issueCoupon() voids any coupon a user already holds before issuing a
  // new one — without this check, calling claim twice would just keep
  // resetting the same 5-minute window, defeating the "real deadline"
  // point of the feature.
  const existing = await getActiveCoupon(session.user.id);
  if (existing) return NextResponse.json({ error: "You already have an active offer" }, { status: 409 });

  const coupon = await issueCoupon(session.user.id, CAMPAIGN_KEY_FOR_PLAN[plan], {
    role: "FLASH_OFFER",
    expiresAt: new Date(Date.now() + FLASH_OFFER_MS),
  });
  if (!coupon) return NextResponse.json({ error: "This offer isn't available right now" }, { status: 400 });

  return NextResponse.json({ coupon });
}
