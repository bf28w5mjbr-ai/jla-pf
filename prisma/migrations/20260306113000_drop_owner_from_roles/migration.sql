-- Drop legacy OWNER role from MembershipRole and OrgAdminRole enums
-- 1) Normalize any remaining OWNER data to ADMIN
UPDATE "Membership"
SET "role" = 'ADMIN'
WHERE "role"::text = 'OWNER';

UPDATE "OrgAdmin"
SET "role" = 'ADMIN'
WHERE "role"::text = 'OWNER';

-- 2) Recreate MembershipRole enum without OWNER
ALTER TABLE "Membership"
  ALTER COLUMN "role" DROP DEFAULT;

CREATE TYPE "MembershipRole_new" AS ENUM ('ADMIN', 'MEMBER');

ALTER TABLE "Membership"
  ALTER COLUMN "role" TYPE "MembershipRole_new"
  USING (
    CASE
      WHEN "role"::text = 'OWNER' THEN 'ADMIN'
      ELSE "role"::text
    END
  )::"MembershipRole_new";

DROP TYPE "MembershipRole";
ALTER TYPE "MembershipRole_new" RENAME TO "MembershipRole";

ALTER TABLE "Membership"
  ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- 3) Recreate OrgAdminRole enum without OWNER
ALTER TABLE "OrgAdmin"
  ALTER COLUMN "role" DROP DEFAULT;

CREATE TYPE "OrgAdminRole_new" AS ENUM ('ADMIN', 'MEMBER');

ALTER TABLE "OrgAdmin"
  ALTER COLUMN "role" TYPE "OrgAdminRole_new"
  USING (
    CASE
      WHEN "role"::text = 'OWNER' THEN 'ADMIN'
      ELSE "role"::text
    END
  )::"OrgAdminRole_new";

DROP TYPE "OrgAdminRole";
ALTER TYPE "OrgAdminRole_new" RENAME TO "OrgAdminRole";

ALTER TABLE "OrgAdmin"
  ALTER COLUMN "role" SET DEFAULT 'ADMIN';
