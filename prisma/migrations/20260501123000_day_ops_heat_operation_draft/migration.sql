-- CreateTable
CREATE TABLE "DayOpsHeatOperationDraft" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "round" "ResultRound" NOT NULL,
    "heatIndex" INTEGER NOT NULL,
    "marshalDraftPayload" JSONB,
    "resultDraftPayload" JSONB,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayOpsHeatOperationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DayOpsHeatOperationDraft_competitionId_eventId_round_heatIndex_key" ON "DayOpsHeatOperationDraft"("competitionId", "eventId", "round", "heatIndex");

-- CreateIndex
CREATE INDEX "DayOpsHeatOperationDraft_competitionId_eventId_idx" ON "DayOpsHeatOperationDraft"("competitionId", "eventId");

-- AddForeignKey
ALTER TABLE "DayOpsHeatOperationDraft" ADD CONSTRAINT "DayOpsHeatOperationDraft_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DayOpsHeatOperationDraft" ADD CONSTRAINT "DayOpsHeatOperationDraft_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DayOpsHeatOperationDraft" ADD CONSTRAINT "DayOpsHeatOperationDraft_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
