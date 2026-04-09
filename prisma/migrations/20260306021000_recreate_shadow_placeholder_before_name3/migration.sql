-- Ensure placeholder tables exist before 20260306025631_name3 in clean replay environments.

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
