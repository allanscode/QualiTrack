-- =================================================================
-- Batch fix: security warnings from Supabase Security Advisor
-- 1. Mutable search_path on trigger functions
-- 2. Mutable search_path + anon EXECUTE on is_admin_user()
-- 3. access_requests INSERT with WITH CHECK (true)
-- 4. Enable HaveIBeenPwned (done via Supabase dashboard)
-- =================================================================

-- -----------------------------------------------------------------
-- 1. Fix mutable search_path on trigger functions
-- -----------------------------------------------------------------
ALTER FUNCTION public.update_updated_at()
  SET search_path TO 'public';

ALTER FUNCTION public.update_user_preferences_updated_at()
  SET search_path TO 'public';

-- -----------------------------------------------------------------
-- 2. Fix is_admin_user(): set search_path + revoke anon EXECUTE
-- -----------------------------------------------------------------
-- is_admin_user() must remain SECURITY DEFINER (avoids infinite
-- recursion in users RLS), but anon should not be able to call it.
ALTER FUNCTION public.is_admin_user()
  SET search_path TO 'public';

REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon;

-- authenticated still needs EXECUTE (used by RLS policies)
-- This is already granted by default, but we ensure it explicitly:
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- -----------------------------------------------------------------
-- 3. Fix access_requests INSERT RLS policies
--    Replace WITH CHECK (true) with field validation
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "access_requests_insert" ON public.access_requests;
CREATE POLICY "access_requests_insert" ON public.access_requests
  FOR INSERT TO anon
  WITH CHECK (
    name IS NOT NULL AND name <> '' AND
    email IS NOT NULL AND email <> ''
  );

DROP POLICY IF EXISTS "access_requests_authenticated_insert" ON public.access_requests;
CREATE POLICY "access_requests_authenticated_insert" ON public.access_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    name IS NOT NULL AND name <> '' AND
    email IS NOT NULL AND email <> ''
  );
