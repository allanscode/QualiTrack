-- An active AI invocation is unique regardless of how long it runs. The
-- server, not the initiating browser, owns its terminal state and draft.
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
  IF v_job.ticket_id IS NOT NULL AND v_job.status = 'running'
    AND (v_job.execution_started_at IS NOT NULL OR v_job.started_at > now() - interval '10 minutes') THEN
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
  UPDATE public.ai_evaluation_jobs SET status = 'completed', finished_at = now(), result = p_result
    WHERE job_id = p_job_id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_ai_evaluation_execution(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ai_evaluation_execution(UUID, UUID, JSONB, JSONB) TO service_role;
-- The browser may report a failure before execution starts, but it cannot
-- inject or replace a successful evaluation; only the Edge worker can finish.
REVOKE ALL ON FUNCTION public.complete_ai_evaluation_job(UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
