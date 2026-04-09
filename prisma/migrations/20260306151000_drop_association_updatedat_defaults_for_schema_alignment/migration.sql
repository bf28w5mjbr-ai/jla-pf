-- Align final schema with Prisma model (@updatedAt without DB defaults).

ALTER TABLE "Association"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "AssociationAdmin"
  ALTER COLUMN "updatedAt" DROP DEFAULT;
