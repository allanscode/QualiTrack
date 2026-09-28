-- Writing user_teams must not query public.users through RLS. The users
-- SELECT policy checks team membership, so that route loops back to
-- user_teams and PostgreSQL rejects the write with 42P17.
BEGIN;

DROP POLICY IF EXISTS user_teams_insert ON public.user_teams;
CREATE POLICY user_teams_insert ON public.user_teams
  FOR INSERT TO authenticated
  WITH CHECK (_private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade'));

DROP POLICY IF EXISTS user_teams_update ON public.user_teams;
CREATE POLICY user_teams_update ON public.user_teams
  FOR UPDATE TO authenticated
  USING (_private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade'))
  WITH CHECK (_private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade'));

DROP POLICY IF EXISTS user_teams_delete ON public.user_teams;
CREATE POLICY user_teams_delete ON public.user_teams
  FOR DELETE TO authenticated
  USING (_private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade'));

COMMIT;
