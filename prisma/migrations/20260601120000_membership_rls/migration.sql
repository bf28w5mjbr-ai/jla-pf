-- Supabase: public."Membership" is exposed to PostgREST; enable RLS with no policies
-- so anon/authenticated cannot read or write membership rows via REST.
-- App access uses Prisma over direct DB (table owner / bypasses RLS).

ALTER TABLE public."Membership" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."Membership" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Membership" FROM PUBLIC;
