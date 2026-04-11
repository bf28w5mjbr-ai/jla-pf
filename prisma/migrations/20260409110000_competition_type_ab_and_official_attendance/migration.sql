-- AlterEnum
ALTER TYPE "CompetitionType" RENAME VALUE 'FIRST' TO 'A';
ALTER TYPE "CompetitionType" RENAME VALUE 'SECOND' TO 'B';

-- CreateEnum
CREATE TYPE "OfficialAttendanceMethod" AS ENUM ('MANUAL', 'NFC');

-- CreateTable
CREATE TABLE "CompetitionOfficialAttendance" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "method" "OfficialAttendanceMethod" NOT NULL DEFAULT 'MANUAL',
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionOfficialAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionOfficialAttendance_competitionId_userId_attendanceDate_key"
ON "CompetitionOfficialAttendance"("competitionId", "userId", "attendanceDate");

-- CreateIndex
CREATE INDEX "CompetitionOfficialAttendance_competitionId_attendanceDate_idx"
ON "CompetitionOfficialAttendance"("competitionId", "attendanceDate");

-- CreateIndex
CREATE INDEX "CompetitionOfficialAttendance_userId_attendanceDate_idx"
ON "CompetitionOfficialAttendance"("userId", "attendanceDate");

-- AddForeignKey
ALTER TABLE "CompetitionOfficialAttendance"
ADD CONSTRAINT "CompetitionOfficialAttendance_competitionId_fkey"
FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionOfficialAttendance"
ADD CONSTRAINT "CompetitionOfficialAttendance_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionOfficialAttendance"
ADD CONSTRAINT "CompetitionOfficialAttendance_recordedByUserId_fkey"
FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
