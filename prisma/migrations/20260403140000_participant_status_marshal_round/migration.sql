-- AlterTable
ALTER TABLE "CompetitionParticipantStatus" ADD COLUMN "marshalRound" "ResultRound" NOT NULL DEFAULT 'HEAT';

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionParticipantStatus_competitionId_eventId_participantType_competitionEntryId_teamEntryId_marshalRound_key" ON "CompetitionParticipantStatus"("competitionId", "eventId", "participantType", "competitionEntryId", "teamEntryId", "marshalRound");

-- CreateIndex
CREATE INDEX "CompetitionParticipantStatus_competitionId_eventId_marshalRound_idx" ON "CompetitionParticipantStatus"("competitionId", "eventId", "marshalRound");
