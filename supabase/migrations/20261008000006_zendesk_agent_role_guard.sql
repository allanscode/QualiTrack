BEGIN;

-- A historical provisional profile carried another agent's Zendesk ID.
-- Preserve the profile and its evaluations; only unlink the disproved identity.
UPDATE public.users
SET external_id = NULL, source_system = NULL
WHERE id = '60b1afcc-e552-455e-b9e4-09b4c8d6f75f'
  AND source_system = 'zendesk'
  AND external_id = '41353722246164'
  AND md5(lower(email)) = '25badc045d5b106cc99768094d6d5eab';

CREATE UNIQUE INDEX IF NOT EXISTS users_zendesk_external_id_unique
  ON public.users (external_id)
  WHERE source_system = 'zendesk' AND external_id IS NOT NULL;

CREATE TABLE public.zendesk_agent_role_events (
  event_id text PRIMARY KEY,
  external_id text NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deactivated boolean NOT NULL,
  revoked_sessions bigint NOT NULL DEFAULT 0,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zendesk_agent_role_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zendesk_agent_role_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.zendesk_agent_role_events TO service_role;

CREATE FUNCTION public.deactivate_zendesk_agent(
  p_event_id text,
  p_external_id text
)
RETURNS TABLE (user_id uuid, deactivated boolean, revoked_sessions bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid;
  v_active boolean;
  v_inserted bigint;
  v_revoked bigint := 0;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) > 100 OR p_event_id !~ '^[A-Za-z0-9-]+$'
     OR p_external_id IS NULL OR p_external_id !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Evento Zendesk inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT u.id, u.active INTO v_user_id, v_active
  FROM public.users u
  WHERE u.source_system = 'zendesk' AND u.external_id = p_external_id
  FOR UPDATE;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Agente Zendesk não vinculado ao QWP.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.zendesk_agent_role_events(event_id, external_id, user_id, deactivated)
  VALUES (p_event_id, p_external_id, v_user_id, false)
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN QUERY SELECT e.user_id, e.deactivated, e.revoked_sessions
      FROM public.zendesk_agent_role_events e WHERE e.event_id = p_event_id;
    RETURN;
  END IF;

  IF v_active THEN
    UPDATE public.users SET active = false WHERE id = v_user_id;
    DELETE FROM auth.sessions WHERE auth.sessions.user_id = v_user_id;
    GET DIAGNOSTICS v_revoked = ROW_COUNT;
    UPDATE public.user_presence_sessions SET offline_at = now(), last_seen_at = now()
      WHERE user_presence_sessions.user_id = v_user_id AND offline_at IS NULL;
  END IF;

  UPDATE public.zendesk_agent_role_events
  SET deactivated = v_active, revoked_sessions = v_revoked
  WHERE event_id = p_event_id;
  RETURN QUERY SELECT v_user_id, v_active, v_revoked;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_zendesk_agent(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_zendesk_agent(text, text) TO service_role;
COMMIT;
