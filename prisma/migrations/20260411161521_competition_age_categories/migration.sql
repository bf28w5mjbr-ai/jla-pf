-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "ageCategoryId" TEXT;

-- CreateTable
CREATE TABLE "CompetitionAgeCategory" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "eligibleBirthDateFrom" DATE,
    "eligibleBirthDateTo" DATE,

    CONSTRAINT "CompetitionAgeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionAgeCategory_competitionId_displayOrder_idx" ON "CompetitionAgeCategory"("competitionId", "displayOrder");

-- CreateIndex
CREATE INDEX "Event_ageCategoryId_idx" ON "Event"("ageCategoryId");

-- AddForeignKey
ALTER TABLE "CompetitionAgeCategory" ADD CONSTRAINT "CompetitionAgeCategory_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ageCategoryId_fkey" FOREIGN KEY ("ageCategoryId") REFERENCES "CompetitionAgeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
