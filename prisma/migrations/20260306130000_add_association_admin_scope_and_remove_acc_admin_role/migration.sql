-- 1) Add association-scoped admin models
CREATE TYPE "AssociationAdminRole" AS ENUM ('ADMIN', 'MEMBER');

CREATE TABLE "Association" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "abbreviation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Association_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssociationAdmin" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "associationId" TEXT NOT NULL,
  "role" "AssociationAdminRole" NOT NULL DEFAULT 'ADMIN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssociationAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssociationAdmin_userId_associationId_key"
  ON "AssociationAdmin"("userId", "associationId");

ALTER TABLE "AssociationAdmin"
  ADD CONSTRAINT "AssociationAdmin_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssociationAdmin"
  ADD CONSTRAINT "AssociationAdmin_associationId_fkey"
  FOREIGN KEY ("associationId") REFERENCES "Association"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Seed default association and migrate legacy ACC_ADMIN users
INSERT INTO "Association" ("id", "name", "abbreviation")
VALUES ('association-default', '日本ライフセービング協会', 'ACC')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AssociationAdmin" ("id", "userId", "associationId", "role")
SELECT
  'association-admin-' || u."id" AS "id",
  u."id" AS "userId",
  'association-default' AS "associationId",
  'ADMIN'::"AssociationAdminRole" AS "role"
FROM "User" u
WHERE u."role"::text = 'ACC_ADMIN'
ON CONFLICT ("userId", "associationId") DO NOTHING;

-- 3) Remove ACC_ADMIN from global Role enum
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

CREATE TYPE "Role_new" AS ENUM ('USER', 'ORG_ADMIN', 'PF_ADMIN');

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (
    CASE
      WHEN "role"::text = 'ACC_ADMIN' THEN 'USER'
      ELSE "role"::text
    END
  )::"Role_new";

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
