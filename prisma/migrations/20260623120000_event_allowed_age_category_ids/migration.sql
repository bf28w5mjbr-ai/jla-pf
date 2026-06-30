-- AlterTable
ALTER TABLE "Event" ADD COLUMN "allowedAgeCategoryIds" JSONB;

-- Backfill: ageCategoryId がある種目は [ageCategoryId] を既定の許可リストに
UPDATE "Event"
SET "allowedAgeCategoryIds" = jsonb_build_array("ageCategoryId")
WHERE "ageCategoryId" IS NOT NULL;
