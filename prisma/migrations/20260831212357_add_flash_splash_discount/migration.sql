-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "discountInr" INTEGER,
ADD COLUMN     "restrictToPurpose" TEXT;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "upgradeSplashShownAt" TIMESTAMP(3);
