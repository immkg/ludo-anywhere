import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redeemCouponCode } from "@/lib/coupons";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code.trim()) return NextResponse.json({ error: "Enter a code" }, { status: 400 });

  const result = await redeemCouponCode(session.user.id, code);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  if (!result.coupon) return NextResponse.json({ error: "That code isn't valid" }, { status: 400 });

  return NextResponse.json({ coupon: result.coupon });
}
