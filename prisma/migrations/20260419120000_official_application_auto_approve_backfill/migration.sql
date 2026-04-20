-- オフィシャル応募: 審査フロー撤廃に伴い既存 PENDING を承認済みへ、新規デフォルトを承認済みに
UPDATE "CompetitionOfficialApplication"
SET
  "status" = 'APPROVED',
  "reviewedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING';

ALTER TABLE "CompetitionOfficialApplication" ALTER COLUMN "status" SET DEFAULT 'APPROVED';
