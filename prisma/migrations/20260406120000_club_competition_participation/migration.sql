-- CreateTable
CREATE TABLE "ClubCompetitionParticipation" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "participating" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubCompetitionParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubCompetitionParticipation_clubId_competitionId_key" ON "ClubCompetitionParticipation"("clubId", "competitionId");

-- CreateIndex
CREATE INDEX "ClubCompetitionParticipation_competitionId_idx" ON "ClubCompetitionParticipation"("competitionId");

-- AddForeignKey
ALTER TABLE "ClubCompetitionParticipation" ADD CONSTRAINT "ClubCompetitionParticipation_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubCompetitionParticipation" ADD CONSTRAINT "ClubCompetitionParticipation_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
