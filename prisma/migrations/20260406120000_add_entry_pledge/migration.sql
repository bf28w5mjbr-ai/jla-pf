-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "entryPledgeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Competition" ADD COLUMN "entryPledgeText" TEXT;
ALTER TABLE "Competition" ADD COLUMN "entryPledgeLockNoOffer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CompetitionEntry" ADD COLUMN "pledgeAcceptedAt" TIMESTAMP(3);
ALTER TABLE "CompetitionEntry" ADD COLUMN "pledgeTextSnapshot" TEXT;

-- 既に公開済みで誓約が無かった大会は、後から誓約を有効化できない
UPDATE "Competition"
SET "entryPledgeLockNoOffer" = true
WHERE "isPublished" = true AND "entryPledgeEnabled" = false;
