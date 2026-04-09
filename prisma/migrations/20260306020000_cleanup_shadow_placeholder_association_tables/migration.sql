-- Shadow DB stabilization cleanup
-- Remove placeholder tables only when they were created by the shadow placeholder migration.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'AssociationAdmin'
      AND a.attname = '__shadow_placeholder'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    DROP TABLE "AssociationAdmin";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'Association'
      AND a.attname = '__shadow_placeholder'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    DROP TABLE "Association";
  END IF;
END $$;
