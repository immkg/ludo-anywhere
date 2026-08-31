import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Accepts either the shared `prisma` client or a `$transaction` callback's
// `tx`, so grantPayment() in billing-fulfillment.ts can issue the
// referrer's reward coupon atomically with the payment it was earned by.
type Db = typeof prisma | Prisma.TransactionClient;

export type CouponRole = "CAMPAIGN" | "REFEREE_WELCOME" | "REFERRER_REWARD";

function campaignIsLive(campaign: { active: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date) {
  if (!campaign.active) return false;
  if (campaign.startsAt && campaign.startsAt > now) return false;
  if (campaign.endsAt && campaign.endsAt < now) return false;
  return true;
}

// A user holds at most one ACTIVE coupon at a time — issuing a new one
// (earned via referral, or claimed via a campaign code) voids whatever
// unused coupon they already had. See the schema comment above Campaign in
// prisma/schema.prisma for why.
export async function issueCoupon(
  userId: string,
  campaignKey: string,
  opts: { role: CouponRole; referralId?: string },
  db: Db = prisma
) {
  const campaign = await db.campaign.findUnique({ where: { key: campaignKey } });
  const now = new Date();
  if (!campaign || !campaignIsLive(campaign, now)) return null;

  await db.coupon.updateMany({
    where: { ownerUserId: userId, status: "ACTIVE" },
    data: { status: "VOIDED", voidedAt: now },
  });

  return db.coupon.create({
    data: {
      code: randomBytes(9).toString("base64url"),
      campaignId: campaign.id,
      ownerUserId: userId,
      role: opts.role,
      referralId: opts.referralId,
    },
    include: { campaign: true },
  });
}

export function getActiveCoupon(userId: string, db: Db = prisma) {
  return db.coupon.findFirst({
    where: { ownerUserId: userId, status: "ACTIVE" },
    include: { campaign: true },
  });
}

// campaignKey doubles as the code a user types in to claim a CAMPAIGN
// coupon — the Coupon row's own `code` field is just an internal per-issue
// identifier, never re-entered by anyone (see the schema comment).
export async function redeemCouponCode(userId: string, typedCode: string) {
  const key = typedCode.trim().toLowerCase();
  const campaign = await prisma.campaign.findUnique({ where: { key } });
  if (!campaign || !campaignIsLive(campaign, new Date())) {
    return { error: "That code isn't valid" as const };
  }
  const coupon = await issueCoupon(userId, campaign.key, { role: "CAMPAIGN" });
  return { coupon };
}
