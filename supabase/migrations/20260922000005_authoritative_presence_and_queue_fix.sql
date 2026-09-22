-- Fonte compartilhada de presença por sessão Auth e correção da distribuição.
-- Uma pessoa é online quando ao menos uma sessão envia heartbeat nos últimos
-- 90 segundos. O cadastro de monitor habilitado para triagem é independente.

CREATE TABLE IF NOT EXISTS public.user_presence_sessions (
  session_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  offline_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_presence_sessions_active
  ON public.user_presence_sessions(user_id, last_seen_at DESC)
  WHERE offline_at IS NULL;

ALTER TABLE public.user_presence_sessions ENABLE ROW LEVEL SECURITY;

-- A tabela é manipulada apenas pelas RPCs SECURITY DEFINER e pela Edge
-- Function administrativa. Nenhuma leitura/escrita direta é concedida.
REVOKE ALL ON public.user_presence_sessions FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quality_monitor_presence'
      AND column_name = 'is_online'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quality_monitor_presence'
      AND column_name = 'is_enabled'
  ) THEN
    ALTER TABLE public.quality_monitor_presence RENAME COLUMN is_online TO is_enabled;
  END IF;
END $$;

COMMENT ON COLUMN public.quality_monitor_presence.is_enabled IS
  'Habilita o monitor para receber tickets; presença online é calculada por user_presence_sessions.';

CREATE OR REPLACE FUNCTION _private.is_user_online(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_presence_sessions s
    WHERE s.user_id = p_user_id
      AND s.offline_at IS NULL
      AND s.last_seen_at > now() - interval '90 seconds'
  );
$$;

REVOKE ALL ON FUNCTION _private.is_user_online(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION _private.is_user_online(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.heartbeat_user_presence()
RETURNS TABLE(
  id UUID,
  name TEXT,
  email TEXT,
  role TEXT,
  active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_session_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão autenticada obrigatória.';
  END IF;

  v_session_id := NULLIF(auth.jwt()->>'session_id', '')::UUID;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Sessão Auth sem session_id.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user_id AND u.active) THEN
    RAISE EXCEPTION 'Usuário inativo ou inexistente.';
  END IF;

  INSERT INTO public.user_presence_sessions(session_id, user_id, started_at, last_seen_at, offline_at)
  VALUES (v_session_id, v_user_id, now(), now(), NULL)
  ON CONFLICT (session_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        last_seen_at = now(),
        offline_at = NULL;

  DELETE FROM public.user_presence_sessions
  WHERE last_seen_at < now() - interval '30 days';

  RETURN QUERY
  SELECT u.id, u.name, u.email, u.role, u.active, u.created_at
  FROM public.users u
  WHERE u.active
    AND EXISTS (
      SELECT 1
      FROM public.user_presence_sessions s
      WHERE s.user_id = u.id
        AND s.offline_at IS NULL
        AND s.last_seen_at > now() - interval '90 seconds'
    )
  ORDER BY u.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat_user_presence() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.heartbeat_user_presence() FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.end_current_presence_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_session_id UUID := NULLIF(auth.jwt()->>'session_id', '')::UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR v_session_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.user_presence_sessions
  SET offline_at = now(), last_seen_at = now()
  WHERE session_id = v_session_id
    AND user_id = (SELECT auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_current_presence_session() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.end_current_presence_session() FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.set_monitor_eligibility(p_user_id UUID, p_enabled BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_row RECORD;
  v_candidate UUID;
BEGIN
  IF NOT _private.is_admin_user() THEN
    RAISE EXCEPTION 'Apenas o Supervisor de Qualidade ou o Administrador pode configurar a triagem.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND role = 'qualidade' AND active
  ) THEN
    RAISE EXCEPTION 'Somente um monitor de qualidade ativo pode ser habilitado.';
  END IF;

  INSERT INTO public.quality_monitor_presence(user_id, is_enabled, updated_at, updated_by)
  VALUES (p_user_id, p_enabled, now(), (SELECT auth.uid()))
  ON CONFLICT (user_id) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by;

  IF NOT p_enabled THEN
    PERFORM pg_advisory_xact_lock(hashtext('qwp_queue_distribution'));

    FOR v_row IN
      SELECT id FROM public.queue_ticket_assignments
      WHERE assigned_to = p_user_id AND status = 'pending'
      ORDER BY assigned_at, id
    LOOP
      SELECT p.user_id INTO v_candidate
      FROM public.quality_monitor_presence p
      JOIN public.users u ON u.id = p.user_id AND u.active AND u.role = 'qualidade'
      LEFT JOIN public.queue_ticket_assignments a
        ON a.assigned_to = p.user_id
       AND (a.assigned_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
      WHERE p.is_enabled
        AND p.user_id <> p_user_id
        AND _private.is_user_online(p.user_id)
      GROUP BY p.user_id
      ORDER BY count(a.id), p.user_id
      LIMIT 1;

      IF v_candidate IS NULL THEN
        DELETE FROM public.queue_ticket_assignments WHERE id = v_row.id;
      ELSE
        UPDATE public.queue_ticket_assignments
        SET assigned_to = v_candidate, assigned_at = now()
        WHERE id = v_row.id;
      END IF;
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_monitor_eligibility(UUID, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_monitor_eligibility(UUID, BOOLEAN) FROM anon, PUBLIC;

-- Compatibilidade durante o rollout de clientes antigos. O parâmetro antigo
-- passa a significar habilitado/desabilitado, não presença de login.
CREATE OR REPLACE FUNCTION public.set_monitor_presence(p_user_id UUID, p_online BOOLEAN)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT public.set_monitor_eligibility(p_user_id, p_online);
$$;

GRANT EXECUTE ON FUNCTION public.set_monitor_presence(UUID, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_monitor_presence(UUID, BOOLEAN) FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.assign_queue_tickets(p_tickets JSONB)
RETURNS TABLE(ticket_id TEXT, queue_type TEXT, assigned_to UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_item JSONB;
  v_ticket_id TEXT;
  v_queue_type TEXT;
  v_candidate UUID;
  v_existing_id UUID;
  v_caller_id UUID := (SELECT auth.uid());
  v_can_see_all BOOLEAN := _private.is_admin_user();
BEGIN
  IF NOT _private.is_quality_team_user() THEN
    RAISE EXCEPTION 'Apenas a equipe de Qualidade pode distribuir chamados da fila de triagem.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('qwp_queue_distribution'));

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_tickets)
  LOOP
    v_ticket_id := v_item->>'ticket_id';
    v_queue_type := v_item->>'queue_type';
    v_candidate := NULL;
    v_existing_id := NULL;

    IF v_ticket_id IS NULL OR v_queue_type NOT IN ('negativas', 'filhos') THEN
      CONTINUE;
    END IF;

    SELECT a.id, a.assigned_to
      INTO v_existing_id, v_candidate
    FROM public.queue_ticket_assignments a
    WHERE a.ticket_id = v_ticket_id AND a.queue_type = v_queue_type;

    IF v_existing_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.quality_monitor_presence p
      JOIN public.users u ON u.id = p.user_id AND u.active AND u.role = 'qualidade'
      WHERE p.user_id = v_candidate
        AND p.is_enabled
        AND _private.is_user_online(p.user_id)
    ) THEN
      v_candidate := NULL;
    END IF;

    IF v_candidate IS NULL THEN
      SELECT p.user_id INTO v_candidate
      FROM public.quality_monitor_presence p
      JOIN public.users u ON u.id = p.user_id AND u.active AND u.role = 'qualidade'
      LEFT JOIN public.queue_ticket_assignments a
        ON a.assigned_to = p.user_id
       AND (a.assigned_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
      WHERE p.is_enabled
        AND _private.is_user_online(p.user_id)
      GROUP BY p.user_id
      ORDER BY count(a.id), p.user_id
      LIMIT 1;

      IF v_candidate IS NULL THEN
        IF v_existing_id IS NOT NULL THEN
          DELETE FROM public.queue_ticket_assignments a WHERE a.id = v_existing_id;
        END IF;
        CONTINUE;
      END IF;

      IF v_existing_id IS NULL THEN
        INSERT INTO public.queue_ticket_assignments(ticket_id, queue_type, assigned_to, status)
        VALUES (v_ticket_id, v_queue_type, v_candidate, 'pending')
        ON CONFLICT ON CONSTRAINT queue_ticket_assignments_ticket_id_queue_type_key
        DO UPDATE SET assigned_to = EXCLUDED.assigned_to, assigned_at = now(), status = 'pending';
      ELSE
        UPDATE public.queue_ticket_assignments a
        SET assigned_to = v_candidate, assigned_at = now()
        WHERE a.id = v_existing_id;
      END IF;
    END IF;

    IF v_can_see_all OR v_candidate = v_caller_id THEN
      ticket_id := v_ticket_id;
      queue_type := v_queue_type;
      assigned_to := v_candidate;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_queue_tickets(JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_queue_tickets(JSONB) FROM anon, PUBLIC;

NOTIFY pgrst, 'reload schema';
