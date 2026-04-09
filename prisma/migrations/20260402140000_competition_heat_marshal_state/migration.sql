-- Per-heat marshal (call window) for day-ops
CREATE TABLE "CompetitionHeatMarshalState" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "round" "ResultRound" NOT NULL,
    "heatIndex" INTEGER NOT NULL,
    "callClosedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionHeatMarshalState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionHeatMarshalState_competitionId_eventId_round_heatIndex_key" ON "CompetitionHeatMarshalState"("competitionId", "eventId", "round", "heatIndex");

CREATE INDEX "CompetitionHeatMarshalState_eventId_round_idx" ON "CompetitionHeatMarshalState"("eventId", "round");

ALTER TABLE "CompetitionHeatMarshalState" ADD CONSTRAINT "CompetitionHeatMarshalState_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompetitionHeatMarshalState" ADD CONSTRAINT "CompetitionHeatMarshalState_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
