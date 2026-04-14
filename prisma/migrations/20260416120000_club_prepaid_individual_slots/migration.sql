-- CreateEnum
CREATE TYPE "ClubPrepaidIndividualSlotStatus" AS ENUM ('PENDING_CLUB_CHECKOUT', 'ACTIVE_WAIVER', 'DEFERRED_POST_CLOSE', 'CONSUMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "CompetitionEntry" ADD COLUMN "clubIndividualFeePaidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClubCompetitionPrepaidIndividualSlot" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "coveredUserId" TEXT NOT NULL,
    "status" "ClubPrepaidIndividualSlotStatus" NOT NULL DEFAULT 'PENDING_CLUB_CHECKOUT',
    "clubPaymentId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "consumedByEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubCompetitionPrepaidIndividualSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubCompetitionPrepaidIndividualSlot_consumedByEntryId_key" ON "ClubCompetitionPrepaidIndividualSlot"("consumedByEntryId");

-- CreateIndex
CREATE INDEX "ClubCompetitionPrepaidIndividualSlot_competitionId_clubId_status_idx" ON "ClubCompetitionPrepaidIndividualSlot"("competitionId", "clubId", "status");

-- CreateIndex
CREATE INDEX "ClubCompetitionPrepaidIndividualSlot_coveredUserId_competitionId_idx" ON "ClubCompetitionPrepaidIndividualSlot"("coveredUserId", "competitionId");

-- AddForeignKey
ALTER TABLE "ClubCompetitionPrepaidIndividualSlot" ADD CONSTRAINT "ClubCompetitionPrepaidIndividualSlot_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubCompetitionPrepaidIndividualSlot" ADD CONSTRAINT "ClubCompetitionPrepaidIndividualSlot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubCompetitionPrepaidIndividualSlot" ADD CONSTRAINT "ClubCompetitionPrepaidIndividualSlot_coveredUserId_fkey" FOREIGN KEY ("coveredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubCompetitionPrepaidIndividualSlot" ADD CONSTRAINT "ClubCompetitionPrepaidIndividualSlot_consumedByEntryId_fkey" FOREIGN KEY ("consumedByEntryId") REFERENCES "CompetitionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
