-- 一時的な自動承認運用: 既存の参加申請（承認待ち）をすべて承認済みにする
UPDATE "Membership"
SET
  "status" = 'APPROVED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING';
