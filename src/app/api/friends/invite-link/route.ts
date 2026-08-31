import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lazily generates and persists a personal invite token on first request,
// mirroring the lazy PlayerProfile upsert in lib/auth.ts — avoids a
// data-migration backfill for existing users.
//
// The origin is read from AUTH_URL, not `request.url` — this app runs a
// custom Node server (server.js), and Next can't reliably derive its own
// origin from the raw request in that setup (see the AUTH_URL comment in
// .env.example, which exists for exactly this reason).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.inviteToken) {
    user = await prisma.user.update({
      where: { id: session.user.id },
      data: { inviteToken: randomBytes(9).toString("base64url") },
    });
  }

  const url = `${process.env.AUTH_URL}/friends/invite/${user.inviteToken}`;

  // Surfaced so share copy reflects whatever the live "referral" Campaign
  // discount is (see prisma/seed-campaigns.mjs) rather than being hardcoded
  // on the client.
  const referralCampaign = await prisma.campaign.findUnique({ where: { key: "referral" } });
  const referralDiscountPercent = referralCampaign?.active ? referralCampaign.discountPercent : null;

  return NextResponse.json({ token: user.inviteToken, url, referralDiscountPercent });
}
