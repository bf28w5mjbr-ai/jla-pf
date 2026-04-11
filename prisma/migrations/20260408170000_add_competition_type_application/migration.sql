-- CreateEnum
CREATE TYPE "CompetitionType" AS ENUM ('FIRST', 'SECOND');

-- CreateEnum
CREATE TYPE "CompetitionTypeApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Competition"
ADD COLUMN "competitionType" "CompetitionType";

-- CreateTable
CREATE TABLE "CompetitionTypeApplication" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "requestedType" "CompetitionType" NOT NULL,
    "status" "CompetitionTypeApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionTypeApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionTypeApplication_competitionId_status_idx" ON "CompetitionTypeApplication"("competitionId", "status");

-- CreateIndex
CREATE INDEX "CompetitionTypeApplication_status_createdAt_idx" ON "CompetitionTypeApplication"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CompetitionTypeApplication" ADD CONSTRAINT "CompetitionTypeApplication_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTypeApplication" ADD CONSTRAINT "CompetitionTypeApplication_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTypeApplication" ADD CONSTRAINT "CompetitionTypeApplication_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
