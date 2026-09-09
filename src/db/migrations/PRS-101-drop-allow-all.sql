-- PRS-101: Drop permissive allow_all RLS policies; harden views; revoke rls_auto_enable.
--
-- Deploy order (critical):
--   1. Set SUPABASE_SERVICE_ROLE_KEY in Railway
--   2. Deploy the bot build that uses service_role
--   3. Apply this migration
--   4. Rotate the anon key
--
-- Do NOT apply while an anon-key bot build is still live — that build will lose DB access.
--
-- Before applying, inventory policies and report in the PR:
--   SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
--
-- Report rls_auto_enable body (do not modify the function in this ticket):
--   SELECT pg_get_functiondef('public.rls_auto_enable'::regproc);
--
-- Manual post-apply check (expect zero rows):
--   SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (
--       policyname LIKE 'allow_all%'
--       OR (cmd = 'ALL' AND qual = 'true' AND with_check = 'true')
--     );

-- =========================
-- UP
-- =========================

-- Drop every allow_all* policy in public (covers schema names and production generic "allow_all").
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'allow_all%'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
  END LOOP;
END;
$$;

-- Explicit drops for schema-encoded names (idempotent if the DO block already removed them).
DROP POLICY IF EXISTS allow_all_users ON users;
DROP POLICY IF EXISTS allow_all_violations ON violations;
DROP POLICY IF EXISTS allow_all_vocabulary ON vocabulary;
DROP POLICY IF EXISTS allow_all_vocabulary_translations ON vocabulary_translations;
DROP POLICY IF EXISTS allow_all_user_vocabulary ON user_vocabulary;
DROP POLICY IF EXISTS allow_all_daily_sessions ON daily_sessions;

-- Tables that carried allow_all in production but were never in schema.sql policy blocks.
DROP POLICY IF EXISTS allow_all ON messages;
DROP POLICY IF EXISTS allow_all ON subscriptions;
DROP POLICY IF EXISTS allow_all ON users;
DROP POLICY IF EXISTS allow_all ON violations;
DROP POLICY IF EXISTS allow_all ON vocabulary;
DROP POLICY IF EXISTS allow_all ON vocabulary_translations;
DROP POLICY IF EXISTS allow_all ON user_vocabulary;
DROP POLICY IF EXISTS allow_all ON daily_sessions;
DROP POLICY IF EXISTS allow_all ON usage_daily;
DROP POLICY IF EXISTS allow_all ON word_sets;

-- Prevent anon/authenticated from re-enabling permissive RLS helpers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rls_auto_enable'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
  END IF;
END;
$$;

-- Callers use their own privileges (fixes security_definer_view advisor findings).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'paying_subscribers'
  ) THEN
    ALTER VIEW public.paying_subscribers SET (security_invoker = true);
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'learners'
  ) THEN
    ALTER VIEW public.learners SET (security_invoker = true);
  END IF;
END;
$$;

-- =========================
-- DOWN
-- =========================
-- Recreate schema allow_all_* policies verbatim so a revert is one file.
-- Prefer redeploying a service_role build instead of reopening anon-key access.

/*
CREATE POLICY allow_all_users ON users
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY allow_all_violations ON violations
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY allow_all_vocabulary ON vocabulary
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY allow_all_vocabulary_translations ON vocabulary_translations
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY allow_all_user_vocabulary ON user_vocabulary
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY allow_all_daily_sessions ON daily_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Optional: restore EXECUTE if you intentionally roll back the revoke.
-- GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO anon, authenticated;

-- Optional: restore SECURITY DEFINER-style view behavior.
-- ALTER VIEW public.paying_subscribers SET (security_invoker = false);
-- ALTER VIEW public.learners SET (security_invoker = false);
*/
