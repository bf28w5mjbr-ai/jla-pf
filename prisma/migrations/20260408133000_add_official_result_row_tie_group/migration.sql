-- AlterTable
ALTER TABLE "OfficialResultRow"
ADD COLUMN "tieGroup" TEXT;

-- AlterTable
ALTER TABLE "CompetitionHeatResultCaptureEvent"
ADD COLUMN "tieGroup" TEXT;

-- CreateIndex
CREATE INDEX "OfficialResultRow_officialResultId_heat_tieGroup_idx"
ON "OfficialResultRow"("officialResultId", "heat", "tieGroup");
