-- SECURITY DEFINER helpers are also called directly by privileged RPCs.
-- Role checks must reject a deactivated account even if its JWT is valid.
CREATE OR REPLACE FUNCTION _private.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND active = true
      AND role IN ('admin', 'gestor_qualidade')
  );
$$;

CREATE OR REPLACE FUNCTION _private.is_quality_team_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND active = true
      AND role IN ('admin', 'gestor_qualidade', 'qualidade')
  );
$$;

CREATE OR REPLACE FUNCTION _private.is_quality_or_support_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND active = true
      AND role IN ('qualidade', 'gestor_suporte')
  );
$$;

CREATE OR REPLACE FUNCTION _private.is_support_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND active = true
      AND role = 'gestor_suporte'
  );
$$;
