// One-off / idempotent seed for the "referral" Campaign — the only one
// referral coupons (see src/lib/coupons.ts) depend on existing. Other
// campaigns (e.g. a festival promo) are created the same way: add a row
// here, or upsert one directly via Prisma Studio — there's no admin UI for
// this yet. Run with `npm run db:seed:campaigns` after DATABASE_URL is set.
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
];

for (const campaign of campaigns) {
  await prisma.campaign.upsert({
    where: { key: campaign.key },
    update: { kind: campaign.kind, discountPercent: campaign.discountPercent, active: campaign.active },
    create: campaign,
  });
  console.log(`Seeded Campaign(key=${campaign.key})`);
}

await prisma.$disconnect();
