-- CreateEnum
CREATE TYPE "OfficialApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CompetitionOfficialApplication" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionName" TEXT NOT NULL,
    "message" TEXT,
    "status" "OfficialApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionOfficialApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionOfficialApplication_competitionId_userId_key" ON "CompetitionOfficialApplication"("competitionId", "userId");

-- CreateIndex
CREATE INDEX "CompetitionOfficialApplication_competitionId_status_idx" ON "CompetitionOfficialApplication"("competitionId", "status");

-- AddForeignKey
ALTER TABLE "CompetitionOfficialApplication" ADD CONSTRAINT "CompetitionOfficialApplication_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionOfficialApplication" ADD CONSTRAINT "CompetitionOfficialApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionOfficialApplication" ADD CONSTRAINT "CompetitionOfficialApplication_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
