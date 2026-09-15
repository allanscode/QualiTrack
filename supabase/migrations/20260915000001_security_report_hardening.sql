BEGIN;
CREATE SCHEMA IF NOT EXISTS _private;
REVOKE ALL ON SCHEMA _private FROM public, anon;
GRANT USAGE ON SCHEMA _private TO authenticated;

CREATE OR REPLACE FUNCTION _private.current_active_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.users WHERE id = (SELECT auth.uid()) AND active = true;
$$;
CREATE OR REPLACE FUNCTION _private.own_team_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT team_id FROM public.user_teams WHERE user_id = (SELECT auth.uid())
    AND _private.current_active_role() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION _private.current_active_role(), _private.own_team_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION _private.current_active_role(), _private.own_team_ids() TO authenticated;

DROP POLICY IF EXISTS security_users_read ON public.users;
CREATE POLICY security_users_read ON public.users AS RESTRICTIVE FOR SELECT TO authenticated USING (
  id = (SELECT auth.uid())
  OR _private.current_active_role() IN ('admin','gestor_qualidade','qualidade')
  OR (_private.current_active_role() = 'gestor_suporte' AND id IN (
    SELECT user_id FROM public.user_teams WHERE team_id IN (SELECT _private.own_team_ids())
  ))
);

-- RESTRICTIVE also limits legacy permissive FOR ALL policies.
DROP POLICY IF EXISTS security_user_teams_read ON public.user_teams;
CREATE POLICY security_user_teams_read ON public.user_teams AS RESTRICTIVE FOR SELECT TO authenticated USING (
  _private.current_active_role() IS NOT NULL AND (
    user_id = (SELECT auth.uid())
    OR _private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade')
    OR (_private.current_active_role() = 'gestor_suporte' AND team_id IN (SELECT _private.own_team_ids()))
  )
);
-- Membership grants access to evaluations: only an active admin may change it.
DROP POLICY IF EXISTS security_user_teams_insert ON public.user_teams;
CREATE POLICY security_user_teams_insert ON public.user_teams AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (_private.is_admin());
DROP POLICY IF EXISTS security_user_teams_update ON public.user_teams;
CREATE POLICY security_user_teams_update ON public.user_teams AS RESTRICTIVE FOR UPDATE TO authenticated USING (_private.is_admin()) WITH CHECK (_private.is_admin());
DROP POLICY IF EXISTS security_user_teams_delete ON public.user_teams;
CREATE POLICY security_user_teams_delete ON public.user_teams AS RESTRICTIVE FOR DELETE TO authenticated USING (_private.is_admin());

DROP POLICY IF EXISTS security_teams_read ON public.teams;
CREATE POLICY security_teams_read ON public.teams AS RESTRICTIVE FOR SELECT TO authenticated USING (
  _private.current_active_role() IN ('admin','gestor_qualidade','qualidade') OR id IN (SELECT _private.own_team_ids())
);
-- Forms and criteria are needed to display historical evaluations, including
-- snapshots from prior teams. Keep metadata readable to active staff, not dormant accounts.
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['forms','form_teams','dissatisfaction_fields','quality_configs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS security_active_read ON public.%I', tbl);
    EXECUTE format('CREATE POLICY security_active_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (_private.current_active_role() IS NOT NULL)', tbl);
  END LOOP;
END $$;

-- All public requests go through the validated/rate-limited Edge Function.
REVOKE INSERT ON public.access_requests FROM anon, authenticated;
DROP POLICY IF EXISTS access_requests_insert ON public.access_requests;
DROP POLICY IF EXISTS access_requests_authenticated_insert ON public.access_requests;

CREATE TABLE IF NOT EXISTS _private.security_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);
REVOKE ALL ON _private.security_rate_limits FROM public, anon, authenticated;
ALTER TABLE _private.security_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_security_rate_limit(bucket_key text, max_requests integer, window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE used integer; moment timestamptz := clock_timestamp();
BEGIN
  IF bucket_key IS NULL OR length(bucket_key) > 200 OR max_requests < 1 OR window_seconds < 1 OR window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;
  -- Bounded retention; serialized atomic upsert across Edge Function instances.
  DELETE FROM _private.security_rate_limits WHERE window_start < moment - interval '1 day';
  INSERT INTO _private.security_rate_limits AS limits (bucket, window_start, attempts)
  VALUES (bucket_key, moment, 1)
  ON CONFLICT (bucket) DO UPDATE SET
    attempts = CASE WHEN limits.window_start <= moment - make_interval(secs => window_seconds) THEN 1 ELSE least(limits.attempts + 1, max_requests + 1) END,
    window_start = CASE WHEN limits.window_start <= moment - make_interval(secs => window_seconds) THEN moment ELSE limits.window_start END
  RETURNING attempts INTO used;
  RETURN used <= max_requests;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_security_rate_limit(text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_security_rate_limit(text, integer, integer) TO service_role;
COMMIT;
