-- owner機能廃止に伴うロール統合
-- 既存の OWNER を ADMIN に寄せる（機能差をなくす）

UPDATE "Membership"
SET "role" = 'ADMIN'
WHERE "role" = 'OWNER';

UPDATE "OrgAdmin"
SET "role" = 'ADMIN'
WHERE "role" = 'OWNER';
