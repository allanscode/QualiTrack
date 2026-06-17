-- =================================================================
-- Fix infinite recursion (42P17) in users RLS policies
-- Recreate is_admin_user() in _private schema with SECURITY DEFINER
-- to break the recursion loop
-- =================================================================

-- Create private schema if not exists
CREATE SCHEMA IF NOT EXISTS _private;

-- Recreate is_admin_user() in _private schema (not public — avoids RPC exposure)
CREATE OR REPLACE FUNCTION _private.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
    AND role IN ('admin', 'gestor_qualidade')
  );
$$;

GRANT EXECUTE ON FUNCTION _private.is_admin_user() TO authenticated;
REVOKE EXECUTE ON FUNCTION _private.is_admin_user() FROM anon, public;

-- Recreate users_select policy using _private.is_admin_user() to avoid recursion
DROP POLICY IF EXISTS "users_select" ON public.users;

CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR _private.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.users AS u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('qualidade', 'gestor_suporte')
    )
  );

-- Recreate users_admin_write policy using _private.is_admin_user() to avoid recursion
DROP POLICY IF EXISTS "users_admin_write" ON public.users;

CREATE POLICY "users_admin_write" ON public.users
  FOR ALL TO authenticated
  USING (
    _private.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.users AS u
      WHERE u.id = (SELECT auth.uid())
        AND u.role = 'gestor_suporte'
    )
  );
