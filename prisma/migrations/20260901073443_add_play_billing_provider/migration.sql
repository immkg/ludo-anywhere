-- AlterTable
ALTER TABLE "Entitlement" ADD COLUMN     "playPurchaseToken" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "playOrderId" TEXT,
ADD COLUMN     "playProductId" TEXT,
ADD COLUMN     "playPurchaseToken" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'UROPAI',
ALTER COLUMN "uropaiOrderId" DROP NOT NULL,
ALTER COLUMN "tenantOrderRef" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_playPurchaseToken_key" ON "Entitlement"("playPurchaseToken");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_playPurchaseToken_key" ON "Payment"("playPurchaseToken");

-- CreateIndex
CREATE INDEX "Payment_provider_idx" ON "Payment"("provider");

