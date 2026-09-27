-- Clean-install bridge: the immutable 20260915010000 baseline predates these
-- helpers, while production migrations beginning 20260917000001 depend on them.
-- Keep this bridge limited to helpers; later migrations own the policies.
CREATE SCHEMA IF NOT EXISTS _private;

CREATE OR REPLACE FUNCTION _private.is_admin_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'gestor_qualidade'));
$$;
GRANT EXECUTE ON FUNCTION _private.is_admin_user() TO authenticated;
REVOKE EXECUTE ON FUNCTION _private.is_admin_user() FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION _private.is_quality_or_support_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND role IN ('qualidade', 'gestor_suporte'));
$$;
GRANT EXECUTE ON FUNCTION _private.is_quality_or_support_user() TO authenticated;
REVOKE EXECUTE ON FUNCTION _private.is_quality_or_support_user() FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION _private.is_support_manager()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND role = 'gestor_suporte');
$$;
GRANT EXECUTE ON FUNCTION _private.is_support_manager() TO authenticated;
REVOKE EXECUTE ON FUNCTION _private.is_support_manager() FROM anon, PUBLIC;
