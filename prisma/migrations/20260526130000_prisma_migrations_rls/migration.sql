-- Supabase: public._prisma_migrations is exposed to PostgREST; enable RLS with no policies
-- so anon/authenticated cannot read migration history. Prisma migrate uses direct DB access.
ALTER TABLE IF EXISTS public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."_prisma_migrations" FROM anon, authenticated;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM PUBLIC;
