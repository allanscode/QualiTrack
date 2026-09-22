-- Keep the job identity independent of the browser and make cancellation durable.
ALTER TABLE public.ai_evaluation_jobs
  ADD COLUMN phase TEXT NOT NULL DEFAULT 'pending'
  CHECK (phase IN ('pending', 'running_glm', 'fallback_gemini', 'retry_pending', 'completed', 'cancelled', 'failed'));
ALTER TABLE public.ai_evaluation_jobs DROP CONSTRAINT ai_evaluation_jobs_status_check;
ALTER TABLE public.ai_evaluation_jobs ADD CONSTRAINT ai_evaluation_jobs_status_check
  CHECK (status IN ('running', 'completed', 'cancelled', 'failed'));
ALTER TABLE public.ai_evaluation_logs ADD COLUMN job_id UUID;
CREATE INDEX ai_evaluation_logs_job_idx ON public.ai_evaluation_logs(job_id);
UPDATE public.ai_evaluation_jobs SET phase = status WHERE status IN ('completed', 'failed');

CREATE OR REPLACE FUNCTION public.set_ai_evaluation_phase(p_job_id UUID, p_phase TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF auth.role() <> 'service_role' OR p_phase NOT IN ('running_glm', 'fallback_gemini', 'retry_pending') THEN
    RAISE EXCEPTION 'Transição de IA não autorizada.';
  END IF;
  UPDATE public.ai_evaluation_jobs SET phase = p_phase
  WHERE job_id = p_job_id AND status = 'running';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.set_ai_evaluation_phase(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ai_evaluation_phase(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_ai_evaluation_job(p_job_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_job public.ai_evaluation_jobs%ROWTYPE; v_actor UUID := (SELECT auth.uid()); v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = v_actor AND active = true;
  SELECT * INTO v_job FROM public.ai_evaluation_jobs WHERE job_id = p_job_id FOR UPDATE;
  IF v_job.job_id IS NULL OR v_role IS NULL OR
    (v_job.started_by <> v_actor AND v_role NOT IN ('admin', 'gestor_qualidade')) THEN
    RAISE EXCEPTION 'Job de IA não autorizado.';
  END IF;
  IF v_job.status <> 'running' THEN RETURN false; END IF;
  UPDATE public.ai_evaluation_jobs
    SET status = 'cancelled', phase = 'cancelled', finished_at = now(), error_message = NULL
  WHERE job_id = p_job_id AND status = 'running';
  DELETE FROM public.ai_evaluation_retry_queue WHERE job_id = p_job_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_ai_evaluation_job(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_ai_evaluation_job(UUID) TO authenticated;

-- A browser cannot replace an executing job, even after a long request.
CREATE OR REPLACE FUNCTION public.claim_ai_evaluation_job(p_ticket_id TEXT, p_evaluation_type TEXT)
RETURNS TABLE(job_id UUID, claimed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_job public.ai_evaluation_jobs%ROWTYPE; v_user UUID := (SELECT auth.uid());
BEGIN
  IF NOT _private.is_quality_team_user() THEN RAISE EXCEPTION 'Apenas a equipe de Qualidade pode avaliar com IA.'; END IF;
  IF p_ticket_id !~ '^[0-9]{1,18}$' OR p_evaluation_type NOT IN ('atendimento', 'chamado_filho') THEN
    RAISE EXCEPTION 'Job inválido.';
  END IF;
  IF NOT _private.is_admin_user() THEN
    IF NOT EXISTS (SELECT 1 FROM public.queue_ticket_catalog c
      WHERE c.ticket_id = p_ticket_id AND c.verified_at > now() - interval '15 minutes'
        AND ((p_evaluation_type = 'chamado_filho' AND c.queue_type IN ('filhos','filhos_invalidos'))
          OR (p_evaluation_type = 'atendimento' AND c.queue_type IN ('negativas','positivas','proativas')))) THEN
      RAISE EXCEPTION 'Ticket fora da fila verificada.';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai_job_' || p_ticket_id));
  IF EXISTS (SELECT 1 FROM public.queue_ticket_assignments a WHERE a.ticket_id = p_ticket_id
    AND a.status <> 'completed' AND a.assigned_to <> v_user) AND NOT _private.is_admin_user() THEN
    RAISE EXCEPTION 'O ticket pertence a outro monitor.';
  END IF;
  SELECT * INTO v_job FROM public.ai_evaluation_jobs WHERE ticket_id = p_ticket_id FOR UPDATE;
  IF v_job.ticket_id IS NOT NULL AND v_job.status = 'running'
    AND (v_job.execution_started_at IS NOT NULL OR v_job.started_at > now() - interval '10 minutes') THEN
    job_id := v_job.job_id; claimed := false; RETURN NEXT; RETURN;
  END IF;
  INSERT INTO public.ai_evaluation_jobs(ticket_id, job_id, evaluation_type, status, phase, started_by, started_at, execution_started_at, finished_at, result, error_message)
  VALUES (p_ticket_id, gen_random_uuid(), p_evaluation_type, 'running', 'pending', v_user, now(), NULL, NULL, NULL, NULL)
  ON CONFLICT (ticket_id) DO UPDATE SET job_id = EXCLUDED.job_id, evaluation_type = EXCLUDED.evaluation_type,
    status = 'running', phase = 'pending', started_by = v_user, started_at = now(), execution_started_at = NULL,
    finished_at = NULL, result = NULL, error_message = NULL
  RETURNING ai_evaluation_jobs.job_id INTO job_id;
  claimed := true; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_ai_evaluation_job(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ai_evaluation_job(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_ai_evaluation_execution(
  p_job_id UUID, p_caller_id UUID, p_result JSONB, p_draft JSONB DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_job public.ai_evaluation_jobs%ROWTYPE; v_form UUID; v_team UUID; v_agent UUID; v_guidelines UUID[];
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Apenas o serviço de IA pode concluir o job.'; END IF;
  SELECT * INTO v_job FROM public.ai_evaluation_jobs WHERE job_id = p_job_id FOR UPDATE;
  IF v_job.job_id IS NULL OR v_job.started_by <> p_caller_id
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
    INSERT INTO public.ai_evaluation_drafts(ticket_id, form_id, agent_name, agent_email, agent_id, team_id,
      channel, satisfaction_comment, result, guideline_ids, created_by)
    VALUES (v_job.ticket_id, v_form, p_draft->>'agent_name', p_draft->>'agent_email', v_agent, v_team,
      p_draft->>'channel', p_draft->>'satisfaction_comment', p_result, v_guidelines, v_job.started_by)
    ON CONFLICT (ticket_id) DO UPDATE SET form_id = EXCLUDED.form_id, agent_name = EXCLUDED.agent_name,
      agent_email = EXCLUDED.agent_email, agent_id = EXCLUDED.agent_id, team_id = EXCLUDED.team_id,
      channel = EXCLUDED.channel, satisfaction_comment = EXCLUDED.satisfaction_comment,
      result = EXCLUDED.result, guideline_ids = EXCLUDED.guideline_ids, created_by = EXCLUDED.created_by;
  END IF;
  UPDATE public.ai_evaluation_jobs SET status = 'completed', phase = 'completed', finished_at = now(), result = p_result
    WHERE job_id = p_job_id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_ai_evaluation_execution(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ai_evaluation_execution(UUID, UUID, JSONB, JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
