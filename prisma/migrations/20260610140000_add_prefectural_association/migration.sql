-- CreateTable
CREATE TABLE "PrefecturalAssociation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefecture" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrefecturalAssociation_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Club" ADD COLUMN "prefecturalAssociationId" TEXT;

-- CreateTable
CREATE TABLE "_CompetitionToPrefecturalAssociation" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CompetitionToPrefecturalAssociation_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "PrefecturalAssociation_displayOrder_idx" ON "PrefecturalAssociation"("displayOrder");

-- CreateIndex
CREATE INDEX "PrefecturalAssociation_isActive_displayOrder_idx" ON "PrefecturalAssociation"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "Club_prefecturalAssociationId_idx" ON "Club"("prefecturalAssociationId");

-- CreateIndex
CREATE INDEX "_CompetitionToPrefecturalAssociation_B_index" ON "_CompetitionToPrefecturalAssociation"("B");

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_prefecturalAssociationId_fkey" FOREIGN KEY ("prefecturalAssociationId") REFERENCES "PrefecturalAssociation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetitionToPrefecturalAssociation" ADD CONSTRAINT "_CompetitionToPrefecturalAssociation_A_fkey" FOREIGN KEY ("A") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetitionToPrefecturalAssociation" ADD CONSTRAINT "_CompetitionToPrefecturalAssociation_B_fkey" FOREIGN KEY ("B") REFERENCES "PrefecturalAssociation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
