-- Restore updatedAt defaults after out-of-order reconcile migration was marked applied.

ALTER TABLE "Association"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "AssociationAdmin"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
