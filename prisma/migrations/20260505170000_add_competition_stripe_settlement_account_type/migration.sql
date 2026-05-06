-- CreateEnum
CREATE TYPE "CompetitionStripeSettlementAccountType" AS ENUM ('ORGANIZER_CONNECT', 'PLATFORM');

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "stripeSettlementAccountType" "CompetitionStripeSettlementAccountType" NOT NULL DEFAULT 'ORGANIZER_CONNECT';
