-- CreateTable
CREATE TABLE "CompetitionGalleryPhoto" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionGalleryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionGalleryPhoto_competitionId_createdAt_idx" ON "CompetitionGalleryPhoto"("competitionId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompetitionGalleryPhoto" ADD CONSTRAINT "CompetitionGalleryPhoto_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
