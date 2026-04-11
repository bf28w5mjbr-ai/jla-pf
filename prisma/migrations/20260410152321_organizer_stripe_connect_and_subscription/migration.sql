-- CreateEnum
CREATE TYPE "OrganizerSubscriptionStatus" AS ENUM ('NONE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'ORG_PLATFORM_SUBSCRIPTION';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "organizerSubscriptionCurrentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "organizerSubscriptionId" TEXT,
ADD COLUMN     "organizerSubscriptionStatus" "OrganizerSubscriptionStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "stripeConnectAccountId" TEXT,
ADD COLUMN     "stripeConnectChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeCustomerId" TEXT;
