-- 既存の所属申請（承認待ち）をすべて承認済みにする
UPDATE "Membership"
SET
  "status" = 'APPROVED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING';

-- 既存の資格申請（審査待ち）をすべて承認済みにする
UPDATE "Qualification"
SET
  "status" = 'APPROVED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING';
