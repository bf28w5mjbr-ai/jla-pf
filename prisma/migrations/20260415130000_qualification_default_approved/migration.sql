-- 保有資格は申請時点で有効（協会側の承認フローなし）
ALTER TABLE "Qualification" ALTER COLUMN "status" SET DEFAULT 'APPROVED';

-- 既存の審査待ちは有効扱いへ（運用上の取りこぼし解消）
UPDATE "Qualification" SET "status" = 'APPROVED' WHERE "status" = 'PENDING';
