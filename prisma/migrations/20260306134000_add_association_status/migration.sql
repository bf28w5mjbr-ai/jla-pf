CREATE TYPE "AssociationStatus" AS ENUM ('PENDING', 'APPROVED');

ALTER TABLE "Association"
  ADD COLUMN "status" "AssociationStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "Association"
SET "status" = 'APPROVED'
WHERE "id" = 'association-default';
