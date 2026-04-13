-- EntryCheckoutSession: チャージバック追跡用カラムと状態
ALTER TYPE "EntryCheckoutSessionStatus" ADD VALUE 'DISPUTED';
ALTER TYPE "EntryCheckoutSessionStatus" ADD VALUE 'DISPUTE_LOST';

ALTER TABLE "EntryCheckoutSession" ADD COLUMN "stripePaymentIntentId" TEXT;
ALTER TABLE "EntryCheckoutSession" ADD COLUMN "stripeDisputeId" TEXT;

CREATE INDEX "EntryCheckoutSession_stripePaymentIntentId_idx" ON "EntryCheckoutSession"("stripePaymentIntentId");
