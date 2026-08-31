// One-off / idempotent seed for Campaign rows — "referral" is the one
// referral coupons (see src/lib/coupons.ts) depend on existing; the two
// "flash_*" campaigns back the flash-discount splash (see
// src/components/game/DiscountSplash.tsx). New campaigns (e.g. a festival
// promo) are created the same way: add a row here, or upsert one directly
// via Prisma Studio — there's no admin UI for this yet. Run with
// `npm run db:seed:campaigns` after DATABASE_URL is set.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const campaigns = [
  {
    key: "referral",
    kind: "REFERRAL",
    discountPercent: 30,
    active: true,
  },
  // The flash-discount splash's two campaigns (see
  // src/components/game/DiscountSplash.tsx). Fixed discountInr rather than
  // discountPercent — ₹49->₹33 and ₹149->₹99 don't share a clean integer
  // percent — and each is restrictToPurpose-locked to the one plan its
  // amount was computed for, so it can't be misapplied to the other and
  // over-discount it. Flip `active: false` here to kill the promo without
  // touching any code.
  {
    key: "flash_game_pack",
    kind: "PROMO",
    discountPercent: 0,
    discountInr: 16, // ₹49 -> ₹33
    restrictToPurpose: "PACK",
    active: true,
  },
  {
    key: "flash_monthly",
    kind: "PROMO",
    discountPercent: 0,
    discountInr: 50, // ₹149 -> ₹99
    restrictToPurpose: "MONTHLY",
    active: true,
  },
];

for (const campaign of campaigns) {
  await prisma.campaign.upsert({
    where: { key: campaign.key },
    update: {
      kind: campaign.kind,
      discountPercent: campaign.discountPercent,
      discountInr: campaign.discountInr ?? null,
      restrictToPurpose: campaign.restrictToPurpose ?? null,
      active: campaign.active,
    },
    create: campaign,
  });
  console.log(`Seeded Campaign(key=${campaign.key})`);
}

await prisma.$disconnect();
