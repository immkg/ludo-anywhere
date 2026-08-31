import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueCoupon } from "@/lib/coupons";

// Visiting someone's private invite link and confirming *is* the mutual
// consent, so this creates an already-accepted friendship directly, unlike
// the search-and-request flow which starts pending.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { token } = await params;
  const owner = await prisma.user.findUnique({ where: { inviteToken: token } });
  if (!owner) return NextResponse.json({ error: "That invite link is invalid" }, { status: 404 });
  if (owner.id === session.user.id) {
    return NextResponse.json({ error: "That's your own invite link" }, { status: 400 });
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: session.user.id, addresseeId: owner.id },
        { requesterId: owner.id, addresseeId: session.user.id },
      ],
    },
  });

  if (existing) {
    if (existing.status !== "accepted") {
      await prisma.friendship.update({
        where: { id: existing.id },
        data: { status: "accepted", respondedAt: new Date() },
      });
    }
  } else {
    await prisma.friendship.create({
      data: {
        requesterId: session.user.id,
        addresseeId: owner.id,
        status: "accepted",
        respondedAt: new Date(),
      },
    });
  }

  // The first invite link anyone ever accepts is their referral moment —
  // no dependency on account age or a callbackUrl-carried code. One
  // Referral per referee ever, enforced by Referral.refereeId's uniqueness.
  const alreadyReferred = await prisma.referral.findUnique({ where: { refereeId: session.user.id } });
  if (!alreadyReferred) {
    const referral = await prisma.referral.create({
      data: { referrerId: owner.id, refereeId: session.user.id, code: token },
    });
    await issueCoupon(session.user.id, "referral", { role: "REFEREE_WELCOME", referralId: referral.id });
  }

  return NextResponse.json({ friend: { userId: owner.id, name: owner.name } });
}
