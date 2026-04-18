ALTER TABLE "ClubAnnouncement"
ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE INDEX "ClubAnnouncement_clubId_publishedAt_idx"
ON "ClubAnnouncement"("clubId", "publishedAt");
