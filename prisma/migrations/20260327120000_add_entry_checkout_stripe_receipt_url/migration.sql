-- Stripe Checkout 完了時に Charge.receipt_url を保持（公式領収書へのリンク）
ALTER TABLE "EntryCheckoutSession" ADD COLUMN "stripeReceiptUrl" TEXT;
