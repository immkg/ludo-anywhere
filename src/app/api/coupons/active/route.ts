import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveCoupon } from "@/lib/coupons";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const coupon = await getActiveCoupon(session.user.id);
  return NextResponse.json({ coupon });
}
