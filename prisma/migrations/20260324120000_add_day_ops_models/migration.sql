-- CreateEnum
CREATE TYPE "DayCheckinMethod" AS ENUM ('NFC', 'MANUAL');

-- CreateEnum
CREATE TYPE "CompetitionParticipantType" AS ENUM ('INDIVIDUAL', 'TEAM');

-- CreateEnum
CREATE TYPE "DayOpsParticipantStatus" AS ENUM ('PENDING', 'CALLED', 'CHECKED_IN', 'DNS', 'WITHDRAWN', 'DSQ');

-- CreateEnum
CREATE TYPE "DraftResultStatus" AS ENUM ('PROVISIONAL', 'FINALIZED');

-- CreateTable
CREATE TABLE "CompetitionRecorderAssignment" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionRecorderAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionDayCheckin" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "method" "DayCheckinMethod" NOT NULL,
    "nfcTagId" TEXT,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionDayCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionParticipantStatus" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "participantType" "CompetitionParticipantType" NOT NULL,
    "competitionEntryId" TEXT,
    "teamEntryId" TEXT,
    "status" "DayOpsParticipantStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "calledAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionParticipantStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionResultDraft" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "round" "ResultRound" NOT NULL DEFAULT 'FINAL',
    "status" "DraftResultStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "note" TEXT,
    "publishedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "lastUpdatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionResultDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionResultDraftRow" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
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

    CONSTRAINT "CompetitionResultDraftRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionRecorderAssignment_competitionId_userId_key" ON "CompetitionRecorderAssignment"("competitionId", "userId");

-- CreateIndex
CREATE INDEX "CompetitionRecorderAssignment_competitionId_isActive_idx" ON "CompetitionRecorderAssignment"("competitionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionDayCheckin_competitionId_userId_eventDate_key" ON "CompetitionDayCheckin"("competitionId", "userId", "eventDate");

-- CreateIndex
CREATE INDEX "CompetitionDayCheckin_competitionId_eventDate_idx" ON "CompetitionDayCheckin"("competitionId", "eventDate");

-- CreateIndex
CREATE INDEX "CompetitionParticipantStatus_competitionId_eventId_status_idx" ON "CompetitionParticipantStatus"("competitionId", "eventId", "status");

-- CreateIndex
CREATE INDEX "CompetitionParticipantStatus_competitionEntryId_idx" ON "CompetitionParticipantStatus"("competitionEntryId");

-- CreateIndex
CREATE INDEX "CompetitionParticipantStatus_teamEntryId_idx" ON "CompetitionParticipantStatus"("teamEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionResultDraft_competitionId_eventId_round_key" ON "CompetitionResultDraft"("competitionId", "eventId", "round");

-- CreateIndex
CREATE INDEX "CompetitionResultDraft_competitionId_eventId_status_idx" ON "CompetitionResultDraft"("competitionId", "eventId", "status");

-- CreateIndex
CREATE INDEX "CompetitionResultDraftRow_draftId_rank_idx" ON "CompetitionResultDraftRow"("draftId", "rank");

-- CreateIndex
CREATE INDEX "CompetitionResultDraftRow_competitionEntryId_idx" ON "CompetitionResultDraftRow"("competitionEntryId");

-- CreateIndex
CREATE INDEX "CompetitionResultDraftRow_teamEntryId_idx" ON "CompetitionResultDraftRow"("teamEntryId");

-- AddForeignKey
ALTER TABLE "CompetitionRecorderAssignment" ADD CONSTRAINT "CompetitionRecorderAssignment_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionRecorderAssignment" ADD CONSTRAINT "CompetitionRecorderAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionRecorderAssignment" ADD CONSTRAINT "CompetitionRecorderAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionDayCheckin" ADD CONSTRAINT "CompetitionDayCheckin_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionDayCheckin" ADD CONSTRAINT "CompetitionDayCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionDayCheckin" ADD CONSTRAINT "CompetitionDayCheckin_checkedInByUserId_fkey" FOREIGN KEY ("checkedInByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionParticipantStatus" ADD CONSTRAINT "CompetitionParticipantStatus_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionParticipantStatus" ADD CONSTRAINT "CompetitionParticipantStatus_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionParticipantStatus" ADD CONSTRAINT "CompetitionParticipantStatus_competitionEntryId_fkey" FOREIGN KEY ("competitionEntryId") REFERENCES "CompetitionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionParticipantStatus" ADD CONSTRAINT "CompetitionParticipantStatus_teamEntryId_fkey" FOREIGN KEY ("teamEntryId") REFERENCES "TeamEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionParticipantStatus" ADD CONSTRAINT "CompetitionParticipantStatus_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResultDraft" ADD CONSTRAINT "CompetitionResultDraft_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResultDraft" ADD CONSTRAINT "CompetitionResultDraft_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResultDraft" ADD CONSTRAINT "CompetitionResultDraft_lastUpdatedByUserId_fkey" FOREIGN KEY ("lastUpdatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResultDraftRow" ADD CONSTRAINT "CompetitionResultDraftRow_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CompetitionResultDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResultDraftRow" ADD CONSTRAINT "CompetitionResultDraftRow_competitionEntryId_fkey" FOREIGN KEY ("competitionEntryId") REFERENCES "CompetitionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResultDraftRow" ADD CONSTRAINT "CompetitionResultDraftRow_teamEntryId_fkey" FOREIGN KEY ("teamEntryId") REFERENCES "TeamEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
