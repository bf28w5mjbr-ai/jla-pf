-- CreateTable
CREATE TABLE "CompetitionEntryCsvExportRequest" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionEntryCsvExportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionEntryCsvExportRequest_competitionId_status_idx" ON "CompetitionEntryCsvExportRequest"("competitionId", "status");

-- CreateIndex
CREATE INDEX "CompetitionEntryCsvExportRequest_status_createdAt_idx" ON "CompetitionEntryCsvExportRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CompetitionEntryCsvExportRequest" ADD CONSTRAINT "CompetitionEntryCsvExportRequest_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntryCsvExportRequest" ADD CONSTRAINT "CompetitionEntryCsvExportRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntryCsvExportRequest" ADD CONSTRAINT "CompetitionEntryCsvExportRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
