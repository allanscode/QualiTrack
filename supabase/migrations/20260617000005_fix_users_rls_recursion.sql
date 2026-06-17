-- =================================================================
-- Fix infinite recursion (42P17) in users RLS policies
-- Recreate helper functions in _private schema with SECURITY DEFINER
-- to break the recursion loop. NO inline subqueries against users
-- are allowed inside policies on users.
-- =================================================================

-- Create private schema if not exists
CREATE SCHEMA IF NOT EXISTS _private;

-- Function: check if current user is admin or gestor_qualidade
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

-- Function: check if current user is qualidade or gestor_suporte
CREATE OR REPLACE FUNCTION _private.is_quality_or_support_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
    AND role IN ('qualidade', 'gestor_suporte')
  );
$$;

GRANT EXECUTE ON FUNCTION _private.is_quality_or_support_user() TO authenticated;
REVOKE EXECUTE ON FUNCTION _private.is_quality_or_support_user() FROM anon, public;

-- Function: check if current user is gestor_suporte
CREATE OR REPLACE FUNCTION _private.is_support_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
    AND role = 'gestor_suporte'
  );
$$;

GRANT EXECUTE ON FUNCTION _private.is_support_manager() TO authenticated;
REVOKE EXECUTE ON FUNCTION _private.is_support_manager() FROM anon, public;

-- Recreate users_select policy — NO inline subqueries against users
DROP POLICY IF EXISTS "users_select" ON public.users;

CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR _private.is_admin_user()
    OR _private.is_quality_or_support_user()
  );

-- Recreate users_admin_write policy — NO inline subqueries against users
DROP POLICY IF EXISTS "users_admin_write" ON public.users;

CREATE POLICY "users_admin_write" ON public.users
  FOR ALL TO authenticated
  USING (
    _private.is_admin_user()
    OR _private.is_support_manager()
  );
