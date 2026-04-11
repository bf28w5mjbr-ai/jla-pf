-- CreateEnum
CREATE TYPE "CompetitionBalanceLineKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "CompetitionBalanceLine" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "lineDate" DATE NOT NULL,
    "accountSubject" TEXT NOT NULL,
    "kind" "CompetitionBalanceLineKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionBalanceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionBalanceLine_competitionId_lineDate_idx" ON "CompetitionBalanceLine"("competitionId", "lineDate");

-- AddForeignKey
ALTER TABLE "CompetitionBalanceLine" ADD CONSTRAINT "CompetitionBalanceLine_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompetitionBalanceLine" ADD CONSTRAINT "CompetitionBalanceLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
