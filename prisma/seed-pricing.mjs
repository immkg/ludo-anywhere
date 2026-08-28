// One-off / idempotent seed for the single active PricingConfig row —
// re-running this only touches `data`/`updatedAt`, never creates a second
// row. Run with `npm run db:seed:pricing` after DATABASE_URL is set.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const data = {
  // Flat allowance — 2 games/day, any player count. A 4-player game costs
  // the same one game as a 2-player one, same unit model as a Game Pack
  // credit.
  freeGamesPerDay: 2,
  // originalPriceInr is the strikethrough "was" price the pricing page
  // shows next to the real price, purely for the "X% off" framing — it
  // isn't charged, doesn't need to be realistic, and is a config value
  // like everything else here so it can be tuned without a deploy — see
  // percentOff() in src/lib/pricing.ts.
  //
  // Game Pack is a week-long pass, not a long-lived balance — 25 credits
  // usable within a week of purchase, then whatever's unused just expires.
  gamePack: { priceInr: 49, credits: 25, expiryHours: 24 * 7, originalPriceInr: 99 }, // ~50% off
  monthly: {
    priceInr: 149,
    days: 30,
    fairUseCapPerDay: 50,
    originalPriceInr: 499, // ~70% off
    // A Monthly subscriber upgrading to Annual gets credit for the days
    // they'd otherwise lose — most credit right after activating, tapering
    // to 0 by the time they'd have renewed anyway. See
    // src/lib/entitlements.ts's getAnnualUpgradeOffer().
    upgradeToAnnualMaxDiscountInr: 49,
  },
  annual: { priceInr: 999, days: 365, fairUseCapPerDay: 50, originalPriceInr: 4999 }, // ~80% off
  enforcementEnabled: true,
};

await prisma.pricingConfig.upsert({
  where: { key: "active" },
  update: { data },
  create: { key: "active", data },
});

console.log("Seeded PricingConfig(key=active):", JSON.stringify(data, null, 2));
await prisma.$disconnect();
