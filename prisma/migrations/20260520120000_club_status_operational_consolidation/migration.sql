-- クラブ成立フロー整理: 運用可能クラブを APPROVED に統一
UPDATE "Club"
SET status = 'APPROVED'
WHERE status IN ('APPLYING', 'JLA_APPROVED');

-- 終了・却下系 INACTIVE を停止に寄せる（完全終了は削除で扱う）
UPDATE "Club"
SET
  status = 'SUSPENDED',
  "suspendedReason" = COALESCE("suspendedReason", 'LEGACY_INACTIVE')
WHERE status = 'INACTIVE';
