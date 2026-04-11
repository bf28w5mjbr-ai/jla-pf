-- CreateEnum
CREATE TYPE "ResultCaptureEventSource" AS ENUM ('NFC', 'MANUAL');

-- CreateEnum
CREATE TYPE "ResultCaptureEventType" AS ENUM ('APPEND', 'REJECTED');

-- CreateTable
CREATE TABLE "CompetitionHeatResultCaptureEvent" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "round" "ResultRound" NOT NULL,
    "heatIndex" INTEGER NOT NULL,
    "lane" INTEGER,
    "rank" INTEGER,
    "source" "ResultCaptureEventSource" NOT NULL,
    "eventType" "ResultCaptureEventType" NOT NULL DEFAULT 'APPEND',
    "participantType" "CompetitionParticipantType" NOT NULL,
    "competitionEntryId" TEXT,
    "teamEntryId" TEXT,
    "capturedByUserId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionHeatResultCaptureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionHeatResultCaptureEvent_competitionId_eventId_round_h_idx" ON "CompetitionHeatResultCaptureEvent"("competitionId", "eventId", "round", "heatIndex", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitionHeatResultCaptureEvent_competitionId_createdAt_idx" ON "CompetitionHeatResultCaptureEvent"("competitionId", "createdAt");
