-- CreateEnum
CREATE TYPE "ClubDuesStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'EXEMPT', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ClubDuesAppliesTo" AS ENUM ('ALL_MEMBERS', 'SELECTED');

-- CreateTable
CREATE TABLE "ClubFiscalYear" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "membershipFee" INTEGER NOT NULL DEFAULT 0,
    "membershipFeeAppliesTo" "ClubDuesAppliesTo" NOT NULL DEFAULT 'ALL_MEMBERS',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubFiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubDues" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "ClubDuesStatus" NOT NULL DEFAULT 'UNPAID',
    "dueDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubDues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubFiscalYear_clubId_startDate_endDate_idx" ON "ClubFiscalYear"("clubId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "ClubFiscalYear_clubId_fiscalYear_key" ON "ClubFiscalYear"("clubId", "fiscalYear");

-- CreateIndex
CREATE INDEX "ClubDues_clubId_status_idx" ON "ClubDues"("clubId", "status");

-- CreateIndex
CREATE INDEX "ClubDues_clubId_fiscalYearId_status_idx" ON "ClubDues"("clubId", "fiscalYearId", "status");

-- CreateIndex
CREATE INDEX "ClubDues_memberId_idx" ON "ClubDues"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubDues_clubId_fiscalYearId_memberId_key" ON "ClubDues"("clubId", "fiscalYearId", "memberId");

-- AddForeignKey
ALTER TABLE "ClubFiscalYear" ADD CONSTRAINT "ClubFiscalYear_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubDues" ADD CONSTRAINT "ClubDues_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubDues" ADD CONSTRAINT "ClubDues_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "ClubFiscalYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubDues" ADD CONSTRAINT "ClubDues_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
