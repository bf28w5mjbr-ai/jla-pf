-- Supabase: public._prisma_migrations is exposed to PostgREST; enable RLS with no policies
-- so anon/authenticated cannot read migration history. Prisma migrate uses direct DB access.
-- shadow DB では _prisma_migrations が未作成のことがあるため存在時のみ実行。

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = '_prisma_migrations'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public."_prisma_migrations" FROM anon, authenticated;
  REVOKE ALL ON TABLE public."_prisma_migrations" FROM PUBLIC;
END $$;
