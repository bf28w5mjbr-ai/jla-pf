-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "scheduleTabId" TEXT,
ADD COLUMN     "scheduleTabSortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CompetitionScheduleTab" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionScheduleTab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionScheduleTab_competitionId_displayOrder_idx" ON "CompetitionScheduleTab"("competitionId", "displayOrder");

-- CreateIndex
CREATE INDEX "Event_scheduleTabId_idx" ON "Event"("scheduleTabId");

-- CreateIndex
CREATE INDEX "Event_competitionId_scheduleTabId_scheduleTabSortOrder_idx" ON "Event"("competitionId", "scheduleTabId", "scheduleTabSortOrder");

-- AddForeignKey
ALTER TABLE "CompetitionScheduleTab" ADD CONSTRAINT "CompetitionScheduleTab_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_scheduleTabId_fkey" FOREIGN KEY ("scheduleTabId") REFERENCES "CompetitionScheduleTab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "DayOpsHeatOperationDraft_competitionId_eventId_round_heatIndex_" RENAME TO "DayOpsHeatOperationDraft_competitionId_eventId_round_heatIn_key";
