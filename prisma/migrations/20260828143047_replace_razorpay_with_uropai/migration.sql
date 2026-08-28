-- DropIndex
DROP INDEX "Payment_razorpayOrderId_key";

-- DropIndex
DROP INDEX "Payment_razorpayPaymentId_key";

-- AlterTable
ALTER TABLE "Payment" RENAME COLUMN "razorpayOrderId" TO "uropaiOrderId";
ALTER TABLE "Payment" RENAME COLUMN "razorpayPaymentId" TO "tenantOrderRef";

-- Backfill rows created under the old Razorpay flow, where this column was
-- nullable (only set once a payment.captured webhook arrived) — Uropai's
-- flow requires this as the idempotency key sent at order-creation time, so
-- it's NOT NULL going forward. These are pre-cutover rows with no real
-- Uropai order behind them; the placeholder just satisfies the constraint.
UPDATE "Payment" SET "tenantOrderRef" = 'legacy-' || "id" WHERE "tenantOrderRef" IS NULL;

ALTER TABLE "Payment" ALTER COLUMN "tenantOrderRef" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_uropaiOrderId_key" ON "Payment"("uropaiOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantOrderRef_key" ON "Payment"("tenantOrderRef");
