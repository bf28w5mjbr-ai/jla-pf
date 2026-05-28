-- AlterTable
ALTER TABLE "CompetitionEntry" ADD COLUMN "organizerPostPayApprovedAt" TIMESTAMP(3),
ADD COLUMN "organizerPostPayApprovedByUserId" TEXT,
ADD COLUMN "organizerManualPaidAt" TIMESTAMP(3),
ADD COLUMN "organizerManualPaidByUserId" TEXT,
ADD COLUMN "organizerManualPaidNote" TEXT;
