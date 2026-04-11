/*
  Warnings:

  - The values [ACTIVE] on the enum `ClubStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [ACTIVE] on the enum `OrgStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "ExpenseOwnerType" AS ENUM ('COMPETITION', 'ORGANIZATION', 'CLUB');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('TRAVEL', 'LODGING', 'VENUE', 'EQUIPMENT', 'PAYROLL', 'OTHER');

-- CreateEnum
CREATE TYPE "ClubType" AS ENUM ('FIRST', 'SECOND', 'THIRD', 'FOURTH');

-- CreateEnum
CREATE TYPE "OnboardingFeeStatus" AS ENUM ('NOT_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "ClubAnnualRegistrationStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ClubTypeApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClubTypeApplicationKind" AS ENUM ('INITIAL', 'CHANGE');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('ORG_ONBOARDING_FEE', 'CLUB_ANNUAL_FEE', 'COMPETITION_ENTRY_FEE');

-- CreateEnum
CREATE TYPE "PaymentOwnerType" AS ENUM ('ORGANIZATION', 'CLUB', 'COMPETITION');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'EXPIRED', 'FAILED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "StripeEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "EntryCheckoutSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CompetitionEntryStatus" AS ENUM ('SUBMITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResultRound" AS ENUM ('FINAL', 'HEAT', 'SEMI');

-- CreateEnum
CREATE TYPE "ResultEntryType" AS ENUM ('INDIVIDUAL', 'TEAM');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('OK', 'DNS', 'DNF', 'DSQ');

-- CreateEnum
CREATE TYPE "ResultUnit" AS ENUM ('TIME_MS', 'DISTANCE_CM', 'POINTS', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "ClubStatus_new" AS ENUM ('APPLYING', 'JLA_APPROVED', 'APPROVED', 'SUSPENDED', 'INACTIVE');
ALTER TABLE "public"."Club" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Club" ALTER COLUMN "status" TYPE "ClubStatus_new" USING ("status"::text::"ClubStatus_new");
ALTER TYPE "ClubStatus" RENAME TO "ClubStatus_old";
ALTER TYPE "ClubStatus_new" RENAME TO "ClubStatus";
DROP TYPE "public"."ClubStatus_old";
ALTER TABLE "Club" ALTER COLUMN "status" SET DEFAULT 'APPLYING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "OrgStatus_new" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED', 'INACTIVE');
ALTER TABLE "public"."Organization" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Organization" ALTER COLUMN "status" TYPE "OrgStatus_new" USING ("status"::text::"OrgStatus_new");
ALTER TYPE "OrgStatus" RENAME TO "OrgStatus_old";
ALTER TYPE "OrgStatus_new" RENAME TO "OrgStatus";
DROP TYPE "public"."OrgStatus_old";
ALTER TABLE "Organization" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'JLA_ADMIN';

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "representativeUserId" TEXT,
ADD COLUMN     "suspendedReason" TEXT,
ADD COLUMN     "type" "ClubType";

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "allowedClubTypes" "ClubType"[];

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "onboardingFeePaidAt" TIMESTAMP(3),
ADD COLUMN     "onboardingFeeStatus" "OnboardingFeeStatus" NOT NULL DEFAULT 'NOT_PAID',
ADD COLUMN     "representativeUserId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "primaryClubId" TEXT;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL DEFAULT 'GENERAL',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "relatedId" TEXT,
    "linkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubAnnualRegistration" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "clubType" "ClubType",
    "registrationFee" INTEGER NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "status" "ClubAnnualRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubAnnualRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubTypeApplication" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "requestedType" "ClubType" NOT NULL,
    "status" "ClubTypeApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "kind" "ClubTypeApplicationKind" NOT NULL DEFAULT 'INITIAL',
    "targetFiscalYear" INTEGER,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubTypeApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "ownerType" "ExpenseOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "taxRate" INTEGER,
    "taxAmount" INTEGER,
    "totalAmount" INTEGER NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseAttachment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "ownerType" "ExpenseOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "limit" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "ownerType" "PaymentOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'jpy',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "metadata" JSONB,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accountId" TEXT,
    "livemode" BOOLEAN NOT NULL,
    "data" JSONB NOT NULL,
    "status" "StripeEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryCheckoutSession" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "EntryCheckoutSessionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'jpy',
    "stripeCheckoutSessionId" TEXT,
    "payload" JSONB,
    "completedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntryCheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionEntry" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "clubId" TEXT,
    "userId" TEXT NOT NULL,
    "status" "CompetitionEntryStatus" NOT NULL DEFAULT 'SUBMITTED',
    "totalFee" INTEGER NOT NULL,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntrySnapshot" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntrySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryItem" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "entryTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamEntry" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamEntryMember" (
    "id" TEXT NOT NULL,
    "teamEntryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "order" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamEntryMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialResult" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "round" "ResultRound" NOT NULL DEFAULT 'FINAL',
    "publishedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialResultRow" (
    "id" TEXT NOT NULL,
    "officialResultId" TEXT NOT NULL,
    "entryType" "ResultEntryType" NOT NULL,
    "competitionEntryId" TEXT,
    "teamEntryId" TEXT,
    "rank" INTEGER,
    "status" "ResultStatus" NOT NULL DEFAULT 'OK',
    "resultValue" INTEGER,
    "unit" "ResultUnit" NOT NULL DEFAULT 'TIME_MS',
    "resultText" TEXT,
    "penaltyValue" INTEGER,
    "remarks" TEXT,
    "lane" INTEGER,
    "heat" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialResultRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ClubAnnualRegistration_clubId_fiscalYear_idx" ON "ClubAnnualRegistration"("clubId", "fiscalYear");

-- CreateIndex
CREATE INDEX "ClubAnnualRegistration_status_idx" ON "ClubAnnualRegistration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClubAnnualRegistration_clubId_fiscalYear_key" ON "ClubAnnualRegistration"("clubId", "fiscalYear");

-- CreateIndex
CREATE INDEX "ClubTypeApplication_clubId_status_idx" ON "ClubTypeApplication"("clubId", "status");

-- CreateIndex
CREATE INDEX "ClubTypeApplication_requestedById_idx" ON "ClubTypeApplication"("requestedById");

-- CreateIndex
CREATE INDEX "Expense_ownerType_ownerId_idx" ON "Expense"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");

-- CreateIndex
CREATE INDEX "ExpenseAttachment_expenseId_idx" ON "ExpenseAttachment"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_ownerType_ownerId_fiscalYear_key" ON "Budget"("ownerType", "ownerId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "Payment"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_ownerType_ownerId_type_key" ON "Payment"("ownerType", "ownerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "StripeEvent_eventId_key" ON "StripeEvent"("eventId");

-- CreateIndex
CREATE INDEX "StripeEvent_type_idx" ON "StripeEvent"("type");

-- CreateIndex
CREATE INDEX "StripeEvent_status_idx" ON "StripeEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EntryCheckoutSession_stripeCheckoutSessionId_key" ON "EntryCheckoutSession"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "EntryCheckoutSession_competitionId_userId_idx" ON "EntryCheckoutSession"("competitionId", "userId");

-- CreateIndex
CREATE INDEX "CompetitionEntry_competitionId_userId_idx" ON "CompetitionEntry"("competitionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "EntrySnapshot_entryId_key" ON "EntrySnapshot"("entryId");

-- CreateIndex
CREATE INDEX "TeamEntry_competitionId_eventId_idx" ON "TeamEntry"("competitionId", "eventId");

-- CreateIndex
CREATE INDEX "TeamEntry_clubId_idx" ON "TeamEntry"("clubId");

-- CreateIndex
CREATE INDEX "TeamEntryMember_teamEntryId_idx" ON "TeamEntryMember"("teamEntryId");

-- CreateIndex
CREATE INDEX "TeamEntryMember_userId_idx" ON "TeamEntryMember"("userId");

-- CreateIndex
CREATE INDEX "OfficialResult_competitionId_publishedAt_idx" ON "OfficialResult"("competitionId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfficialResult_competitionId_eventId_round_key" ON "OfficialResult"("competitionId", "eventId", "round");

-- CreateIndex
CREATE INDEX "OfficialResultRow_officialResultId_rank_idx" ON "OfficialResultRow"("officialResultId", "rank");

-- CreateIndex
CREATE INDEX "OfficialResultRow_competitionEntryId_idx" ON "OfficialResultRow"("competitionEntryId");

-- CreateIndex
CREATE INDEX "OfficialResultRow_teamEntryId_idx" ON "OfficialResultRow"("teamEntryId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_primaryClubId_fkey" FOREIGN KEY ("primaryClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_representativeUserId_fkey" FOREIGN KEY ("representativeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_representativeUserId_fkey" FOREIGN KEY ("representativeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAnnualRegistration" ADD CONSTRAINT "ClubAnnualRegistration_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTypeApplication" ADD CONSTRAINT "ClubTypeApplication_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTypeApplication" ADD CONSTRAINT "ClubTypeApplication_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubTypeApplication" ADD CONSTRAINT "ClubTypeApplication_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryCheckoutSession" ADD CONSTRAINT "EntryCheckoutSession_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryCheckoutSession" ADD CONSTRAINT "EntryCheckoutSession_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryCheckoutSession" ADD CONSTRAINT "EntryCheckoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryCheckoutSession" ADD CONSTRAINT "EntryCheckoutSession_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntrySnapshot" ADD CONSTRAINT "EntrySnapshot_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryItem" ADD CONSTRAINT "EntryItem_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryItem" ADD CONSTRAINT "EntryItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEntry" ADD CONSTRAINT "TeamEntry_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEntry" ADD CONSTRAINT "TeamEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEntry" ADD CONSTRAINT "TeamEntry_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEntryMember" ADD CONSTRAINT "TeamEntryMember_teamEntryId_fkey" FOREIGN KEY ("teamEntryId") REFERENCES "TeamEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEntryMember" ADD CONSTRAINT "TeamEntryMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialResult" ADD CONSTRAINT "OfficialResult_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialResult" ADD CONSTRAINT "OfficialResult_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialResultRow" ADD CONSTRAINT "OfficialResultRow_officialResultId_fkey" FOREIGN KEY ("officialResultId") REFERENCES "OfficialResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialResultRow" ADD CONSTRAINT "OfficialResultRow_competitionEntryId_fkey" FOREIGN KEY ("competitionEntryId") REFERENCES "CompetitionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialResultRow" ADD CONSTRAINT "OfficialResultRow_teamEntryId_fkey" FOREIGN KEY ("teamEntryId") REFERENCES "TeamEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
