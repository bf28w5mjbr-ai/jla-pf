-- CreateTable
CREATE TABLE "CompetitionStartListSnapshot" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionStartListSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionStartListSnapshot_competitionId_key" ON "CompetitionStartListSnapshot"("competitionId");

-- AddForeignKey
ALTER TABLE "CompetitionStartListSnapshot" ADD CONSTRAINT "CompetitionStartListSnapshot_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionStartListSnapshot" ADD CONSTRAINT "CompetitionStartListSnapshot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
