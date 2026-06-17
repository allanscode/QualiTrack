-- =================================================================
-- Batch fix: security warnings from Supabase Security Advisor
-- 1. Mutable search_path on trigger functions
-- 2. Drop is_admin_user() — unused by any RLS policy
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
-- 2. Drop is_admin_user() — unused, all policies use inline EXISTS
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.is_admin_user();

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
