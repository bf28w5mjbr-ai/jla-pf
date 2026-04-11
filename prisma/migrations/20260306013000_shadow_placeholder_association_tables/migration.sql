-- Shadow DB stabilization for 20260306013815_reconcile_association_schema
-- Create temporary placeholder tables only when Association tables don't exist yet.

DO $$
BEGIN
  IF to_regclass('public."Association"') IS NULL THEN
    CREATE TABLE "Association" (
      "id" TEXT NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "__shadow_placeholder" BOOLEAN NOT NULL DEFAULT TRUE,
      CONSTRAINT "Association_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."AssociationAdmin"') IS NULL THEN
    CREATE TABLE "AssociationAdmin" (
      "id" TEXT NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "__shadow_placeholder" BOOLEAN NOT NULL DEFAULT TRUE,
      CONSTRAINT "AssociationAdmin_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;
