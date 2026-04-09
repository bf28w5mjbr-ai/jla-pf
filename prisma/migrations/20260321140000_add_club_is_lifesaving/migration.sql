-- AlterTable
ALTER TABLE "Club" ADD COLUMN "isLifesavingClub" BOOLEAN NOT NULL DEFAULT false;

-- 既存データ: 監視場所が入っているクラブはライフセービングクラブとみなす
UPDATE "Club"
SET "isLifesavingClub" = true
WHERE "patrolLocation" IS NOT NULL AND btrim("patrolLocation") <> '';
