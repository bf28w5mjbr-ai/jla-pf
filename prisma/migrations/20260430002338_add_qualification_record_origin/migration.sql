-- CreateEnum
CREATE TYPE "QualificationRecordOrigin" AS ENUM ('USER_APPLICATION', 'ASSOCIATION_IMPORT');

-- AlterTable
ALTER TABLE "Qualification" ADD COLUMN     "recordOrigin" "QualificationRecordOrigin" NOT NULL DEFAULT 'USER_APPLICATION';

-- CreateIndex
CREATE INDEX "Qualification_userId_recordOrigin_idx" ON "Qualification"("userId", "recordOrigin");

-- RenameIndex
ALTER INDEX "ClubCompetitionPrepaidIndividualSlot_competitionId_clubId_statu" RENAME TO "ClubCompetitionPrepaidIndividualSlot_competitionId_clubId_s_idx";

-- RenameIndex
ALTER INDEX "ClubCompetitionPrepaidIndividualSlot_coveredUserId_competitionI" RENAME TO "ClubCompetitionPrepaidIndividualSlot_coveredUserId_competit_idx";
