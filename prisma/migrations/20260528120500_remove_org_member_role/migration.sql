-- Promote legacy MEMBER rows before shrinking enum.
UPDATE "OrgAdmin"
SET "role" = 'ADMIN'
WHERE "role" = 'MEMBER';

UPDATE "OrganizationAdminInvitation"
SET "role" = 'ADMIN'
WHERE "role" = 'MEMBER';

-- Rebuild OrgAdminRole enum without MEMBER.
CREATE TYPE "OrgAdminRole_new" AS ENUM ('ADMIN');

-- Drop defaults tied to old enum before type cast.
ALTER TABLE "OrgAdmin"
ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "OrganizationAdminInvitation"
ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "OrgAdmin"
ALTER COLUMN "role" TYPE "OrgAdminRole_new"
USING ("role"::text::"OrgAdminRole_new");

ALTER TABLE "OrganizationAdminInvitation"
ALTER COLUMN "role" TYPE "OrgAdminRole_new"
USING ("role"::text::"OrgAdminRole_new");

ALTER TYPE "OrgAdminRole" RENAME TO "OrgAdminRole_old";
ALTER TYPE "OrgAdminRole_new" RENAME TO "OrgAdminRole";
DROP TYPE "OrgAdminRole_old";

-- Restore defaults on renamed enum type.
ALTER TABLE "OrgAdmin"
ALTER COLUMN "role" SET DEFAULT 'ADMIN';

ALTER TABLE "OrganizationAdminInvitation"
ALTER COLUMN "role" SET DEFAULT 'ADMIN';
