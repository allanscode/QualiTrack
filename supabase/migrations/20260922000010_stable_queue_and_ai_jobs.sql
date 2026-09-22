-- Keep ticket ownership stable. Presence changes rebalance only movable work.
CREATE OR REPLACE FUNCTION _private.rebalance_pending_queue()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_row RECORD;
  v_recipient UUID;
  v_donor UUID;
  v_ticket UUID;
  v_low INTEGER;
  v_high INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('qwp_queue_distribution'));
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.queue_load(user_id UUID PRIMARY KEY, amount INTEGER NOT NULL) ON COMMIT DROP;
  TRUNCATE pg_temp.queue_load;
  INSERT INTO pg_temp.queue_load(user_id, amount)
  SELECT p.user_id, count(a.id)::INTEGER
  FROM public.quality_monitor_presence p
  JOIN public.users u ON u.id = p.user_id AND u.active AND u.role = 'qualidade'
  LEFT JOIN public.queue_ticket_assignments a ON a.assigned_to = p.user_id AND a.status = 'pending'
  WHERE p.is_enabled AND _private.is_user_online(p.user_id)
  GROUP BY p.user_id;

  -- Offline owners lose only work that has not begun.
  FOR v_row IN
    SELECT a.id FROM public.queue_ticket_assignments a
    WHERE a.status = 'pending'
      AND NOT EXISTS (SELECT 1 FROM pg_temp.queue_load l WHERE l.user_id = a.assigned_to)
    ORDER BY a.assigned_at, a.ticket_id
  LOOP
    SELECT user_id INTO v_recipient FROM pg_temp.queue_load ORDER BY amount, user_id LIMIT 1;
    IF v_recipient IS NULL THEN
      DELETE FROM public.queue_ticket_assignments WHERE id = v_row.id;
    ELSE
      UPDATE public.queue_ticket_assignments
      SET assigned_to = v_recipient, assigned_at = now(), assignment_source = 'automatic', assigned_by = NULL
      WHERE id = v_row.id;
      UPDATE pg_temp.queue_load SET amount = amount + 1 WHERE user_id = v_recipient;
    END IF;
  END LOOP;

  -- Move the minimum number of automatic pending tickets needed for balance.
  -- A manual assignment stays put while its owner is online.
  LOOP
    SELECT user_id, amount INTO v_recipient, v_low FROM pg_temp.queue_load ORDER BY amount, user_id LIMIT 1;
    EXIT WHEN v_recipient IS NULL;
    SELECT l.user_id, l.amount, a.id INTO v_donor, v_high, v_ticket
    FROM pg_temp.queue_load l
    JOIN LATERAL (
      SELECT id FROM public.queue_ticket_assignments
      WHERE assigned_to = l.user_id AND status = 'pending' AND assignment_source = 'automatic'
      ORDER BY assigned_at DESC, ticket_id DESC LIMIT 1
    ) a ON true
    WHERE l.amount > v_low + 1
    ORDER BY l.amount DESC, l.user_id LIMIT 1;
    EXIT WHEN v_ticket IS NULL;
    UPDATE public.queue_ticket_assignments SET assigned_to = v_recipient, assigned_at = now() WHERE id = v_ticket;
    UPDATE pg_temp.queue_load SET amount = amount - 1 WHERE user_id = v_donor;
    UPDATE pg_temp.queue_load SET amount = amount + 1 WHERE user_id = v_recipient;
    v_ticket := NULL;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION _private.rebalance_pending_queue() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_queue_tickets(p_tickets JSONB)
RETURNS TABLE(ticket_id TEXT, queue_type TEXT, assigned_to UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_item JSONB;
  v_id TEXT;
  v_type TEXT;
  v_owner UUID;
  v_existing public.queue_ticket_assignments%ROWTYPE;
  v_caller UUID := (SELECT auth.uid());
  v_all BOOLEAN := _private.is_admin_user();
BEGIN
  IF NOT _private.is_quality_team_user() THEN RAISE EXCEPTION 'Apenas a equipe de Qualidade pode distribuir chamados.'; END IF;
  IF jsonb_typeof(p_tickets) <> 'array' THEN RAISE EXCEPTION 'Lista de tickets inválida.'; END IF;
  PERFORM _private.rebalance_pending_queue();
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_tickets) ORDER BY value->>'queue_type', value->>'ticket_id' LOOP
    v_id := v_item->>'ticket_id'; v_type := v_item->>'queue_type'; v_owner := NULL;
    IF v_id IS NULL OR v_type NOT IN ('negativas', 'filhos') THEN CONTINUE; END IF;
    SELECT a.* INTO v_existing FROM public.queue_ticket_assignments a
      WHERE a.ticket_id = v_id AND a.queue_type = v_type FOR UPDATE;
    IF v_existing.id IS NOT NULL THEN
      v_owner := v_existing.assigned_to;
    ELSE
      SELECT l.user_id INTO v_owner FROM pg_temp.queue_load l ORDER BY l.amount, l.user_id LIMIT 1;
      IF v_owner IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.queue_ticket_assignments(ticket_id, queue_type, assigned_to, status, assignment_source)
      VALUES (v_id, v_type, v_owner, 'pending', 'automatic')
      ON CONFLICT ON CONSTRAINT queue_ticket_assignments_ticket_id_queue_type_key DO NOTHING;
      UPDATE pg_temp.queue_load SET amount = amount + 1 WHERE user_id = v_owner;
    END IF;
    IF v_all OR v_owner = v_caller THEN
      ticket_id := v_id; queue_type := v_type; assigned_to := v_owner; RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.assign_queue_tickets(JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_queue_tickets(JSONB) FROM PUBLIC, anon;

-- Rebalance when a monitor is enabled, disabled, joins or leaves. Heartbeats
-- also repair owners whose browser disappeared without a clean logout.
CREATE OR REPLACE FUNCTION public.set_monitor_eligibility(p_user_id UUID, p_enabled BOOLEAN)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT _private.is_admin_user() THEN RAISE EXCEPTION 'Apenas Supervisor de Qualidade ou Administrador pode configurar a triagem.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND active AND role = 'qualidade') THEN
    RAISE EXCEPTION 'Somente um monitor ativo pode ser habilitado.';
  END IF;
  INSERT INTO public.quality_monitor_presence(user_id, is_enabled, updated_at, updated_by)
  VALUES (p_user_id, p_enabled, now(), (SELECT auth.uid()))
  ON CONFLICT (user_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = now(), updated_by = EXCLUDED.updated_by;
  PERFORM _private.rebalance_pending_queue();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_monitor_eligibility(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.heartbeat_user_presence()
RETURNS TABLE(id UUID, name TEXT, email TEXT, role TEXT, active BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_user_id UUID := (SELECT auth.uid()); v_session_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Sessão autenticada obrigatória.'; END IF;
  v_session_id := NULLIF(auth.jwt()->>'session_id', '')::UUID;
  IF v_session_id IS NULL THEN RAISE EXCEPTION 'Sessão Auth sem session_id.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user_id AND u.active) THEN
    RAISE EXCEPTION 'Usuário inativo ou inexistente.';
  END IF;
  INSERT INTO public.user_presence_sessions(session_id, user_id, started_at, last_seen_at, offline_at)
  VALUES (v_session_id, v_user_id, now(), now(), NULL)
  ON CONFLICT (session_id) DO UPDATE SET user_id = EXCLUDED.user_id, last_seen_at = now(), offline_at = NULL;
  DELETE FROM public.user_presence_sessions WHERE last_seen_at < now() - interval '30 days';
  PERFORM _private.rebalance_pending_queue();
  RETURN QUERY SELECT u.id, u.name, u.email, u.role, u.active, u.created_at FROM public.users u
    WHERE u.active AND _private.is_user_online(u.id) ORDER BY u.name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.heartbeat_user_presence() TO authenticated;

CREATE OR REPLACE FUNCTION public.end_current_presence_session()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_session_id UUID := NULLIF(auth.jwt()->>'session_id', '')::UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR v_session_id IS NULL THEN RETURN; END IF;
  UPDATE public.user_presence_sessions SET offline_at = now(), last_seen_at = now()
    WHERE session_id = v_session_id AND user_id = (SELECT auth.uid());
  PERFORM _private.rebalance_pending_queue();
END;
$$;
GRANT EXECUTE ON FUNCTION public.end_current_presence_session() TO authenticated;

-- A job has its own lifecycle and does not lock ticket ownership.
CREATE TABLE public.ai_evaluation_jobs (
  ticket_id TEXT PRIMARY KEY,
  job_id UUID NOT NULL DEFAULT gen_random_uuid(),
  evaluation_type TEXT NOT NULL CHECK (evaluation_type IN ('atendimento', 'chamado_filho')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  execution_started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  result JSONB,
  error_message TEXT
);
ALTER TABLE public.ai_evaluation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_evaluation_jobs_read ON public.ai_evaluation_jobs FOR SELECT TO authenticated
  USING (_private.is_quality_team_user());
REVOKE INSERT, UPDATE, DELETE ON public.ai_evaluation_jobs FROM authenticated, anon;
GRANT SELECT ON public.ai_evaluation_jobs TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_ai_evaluation_job(p_ticket_id TEXT, p_evaluation_type TEXT)
RETURNS TABLE(job_id UUID, claimed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_job public.ai_evaluation_jobs%ROWTYPE; v_user UUID := (SELECT auth.uid());
BEGIN
  IF NOT _private.is_quality_team_user() THEN RAISE EXCEPTION 'Apenas a equipe de Qualidade pode avaliar com IA.'; END IF;
  IF p_ticket_id IS NULL OR p_evaluation_type NOT IN ('atendimento', 'chamado_filho') THEN RAISE EXCEPTION 'Job inválido.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai_job_' || p_ticket_id));
  IF EXISTS (SELECT 1 FROM public.queue_ticket_assignments a WHERE a.ticket_id = p_ticket_id
    AND a.status <> 'completed' AND a.assigned_to <> v_user) AND NOT _private.is_admin_user() THEN
    RAISE EXCEPTION 'O ticket pertence a outro monitor.';
  END IF;
  SELECT * INTO v_job FROM public.ai_evaluation_jobs WHERE ticket_id = p_ticket_id FOR UPDATE;
  IF v_job.ticket_id IS NOT NULL AND v_job.status = 'running' AND v_job.started_at > now() - interval '20 minutes' THEN
    job_id := v_job.job_id; claimed := false; RETURN NEXT; RETURN;
  END IF;
  INSERT INTO public.ai_evaluation_jobs(ticket_id, job_id, evaluation_type, status, started_by, started_at, execution_started_at, finished_at, result, error_message)
  VALUES (p_ticket_id, gen_random_uuid(), p_evaluation_type, 'running', v_user, now(), NULL, NULL, NULL, NULL)
  ON CONFLICT (ticket_id) DO UPDATE SET job_id = EXCLUDED.job_id, evaluation_type = EXCLUDED.evaluation_type,
    status = 'running', started_by = v_user, started_at = now(), execution_started_at = NULL,
    finished_at = NULL, result = NULL, error_message = NULL
  RETURNING ai_evaluation_jobs.job_id INTO job_id;
  claimed := true; RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_ai_evaluation_job(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_ai_evaluation_job(TEXT, TEXT) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.begin_ai_evaluation_execution(p_job_id UUID, p_caller_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  UPDATE public.ai_evaluation_jobs SET execution_started_at = now()
  WHERE job_id = p_job_id AND started_by = p_caller_id
    AND status = 'running' AND execution_started_at IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_ai_evaluation_execution(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_ai_evaluation_execution(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_ai_evaluation_job(p_job_id UUID, p_result JSONB, p_draft JSONB DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_job public.ai_evaluation_jobs%ROWTYPE; v_form UUID; v_team UUID; v_agent UUID; v_guidelines UUID[];
BEGIN
  SELECT * INTO v_job FROM public.ai_evaluation_jobs WHERE job_id = p_job_id FOR UPDATE;
  IF v_job.job_id IS NULL OR v_job.started_by <> (SELECT auth.uid())
    OR v_job.status <> 'running' OR v_job.execution_started_at IS NULL THEN
    RAISE EXCEPTION 'Job de IA inválido ou já concluído.';
  END IF;
  IF p_result IS NULL OR jsonb_typeof(p_result) <> 'object' THEN RAISE EXCEPTION 'Resultado de IA inválido.'; END IF;
  IF v_job.evaluation_type = 'atendimento' THEN
    IF p_draft IS NULL OR jsonb_typeof(p_draft) <> 'object' OR nullif(p_result->>'summary', '') IS NULL THEN
      RAISE EXCEPTION 'Rascunho de avaliação incompleto.';
    END IF;
    v_form := NULLIF(p_draft->>'form_id', '')::UUID;
    v_team := NULLIF(p_draft->>'team_id', '')::UUID;
    v_agent := NULLIF(p_draft->>'agent_id', '')::UUID;
    SELECT COALESCE(array_agg(value::UUID), '{}'::UUID[]) INTO v_guidelines
      FROM jsonb_array_elements_text(COALESCE(p_draft->'guideline_ids', '[]'::JSONB));
    -- The job owner may have lost the ticket meanwhile. The trigger accepts
    -- this exact job only during this transaction.
    PERFORM set_config('app.ai_job_finalize', p_job_id::TEXT, true);
    INSERT INTO public.ai_evaluation_drafts(ticket_id, form_id, agent_name, agent_email, agent_id, team_id,
      channel, satisfaction_comment, result, guideline_ids, created_by)
    VALUES (v_job.ticket_id, v_form, p_draft->>'agent_name', p_draft->>'agent_email', v_agent, v_team,
      p_draft->>'channel', p_draft->>'satisfaction_comment', p_result, v_guidelines, v_job.started_by)
    ON CONFLICT (ticket_id) DO UPDATE SET form_id = EXCLUDED.form_id, agent_name = EXCLUDED.agent_name,
      agent_email = EXCLUDED.agent_email, agent_id = EXCLUDED.agent_id, team_id = EXCLUDED.team_id,
      channel = EXCLUDED.channel, satisfaction_comment = EXCLUDED.satisfaction_comment,
      result = EXCLUDED.result, guideline_ids = EXCLUDED.guideline_ids, created_by = EXCLUDED.created_by;
  END IF;
  UPDATE public.ai_evaluation_jobs SET status = 'completed', finished_at = now(), result = p_result WHERE job_id = p_job_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_ai_evaluation_job(UUID, JSONB, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_ai_evaluation_job(UUID, JSONB, JSONB) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.fail_ai_evaluation_job(p_job_id UUID, p_error TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  UPDATE public.ai_evaluation_jobs SET status = 'failed', finished_at = now(), error_message = left(p_error, 500)
  WHERE job_id = p_job_id AND started_by = (SELECT auth.uid()) AND status = 'running';
END;
$$;
GRANT EXECUTE ON FUNCTION public.fail_ai_evaluation_job(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_ai_evaluation_job(UUID, TEXT) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.enforce_queue_draft_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_owner UUID; v_role TEXT; v_token TEXT := current_setting('app.ai_job_finalize', true);
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = (SELECT auth.uid());
  IF v_role = 'qualidade' THEN
    SELECT assigned_to INTO v_owner FROM public.queue_ticket_assignments
    WHERE ticket_id = NEW.ticket_id AND status IN ('pending', 'in_progress') ORDER BY assigned_at DESC LIMIT 1;
    IF v_owner IS NOT NULL AND v_owner <> (SELECT auth.uid()) AND NOT EXISTS (
      SELECT 1 FROM public.ai_evaluation_jobs j
      WHERE j.ticket_id = NEW.ticket_id AND j.job_id::TEXT = v_token
        AND j.started_by = (SELECT auth.uid()) AND j.status = 'running'
    ) THEN RAISE EXCEPTION 'Este ticket foi transferido para outro monitor e o rascunho não pode ser salvo.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public' AND tablename = 'ai_evaluation_jobs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_evaluation_jobs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public' AND tablename = 'ai_evaluation_drafts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_evaluation_drafts;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
