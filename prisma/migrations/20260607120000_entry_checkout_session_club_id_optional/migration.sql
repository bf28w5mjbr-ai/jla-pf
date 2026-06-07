-- EntryCheckoutSession: 所属クラブ不要大会での個人 Checkout 用に clubId を任意化
ALTER TABLE "EntryCheckoutSession" DROP CONSTRAINT "EntryCheckoutSession_clubId_fkey";

ALTER TABLE "EntryCheckoutSession" ALTER COLUMN "clubId" DROP NOT NULL;

ALTER TABLE "EntryCheckoutSession" ADD CONSTRAINT "EntryCheckoutSession_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
