-- A monitor may start only a job for a recently verified queue ticket. The
-- ownership check is atomic with the job claim. Admin/supervisors retain the
-- manual-audit path; the worker continues independently after a transfer.
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
  INSERT INTO public.ai_evaluation_jobs(ticket_id, job_id, evaluation_type, status, started_by, started_at, execution_started_at, finished_at, result, error_message)
  VALUES (p_ticket_id, gen_random_uuid(), p_evaluation_type, 'running', v_user, now(), NULL, NULL, NULL, NULL)
  ON CONFLICT (ticket_id) DO UPDATE SET job_id = EXCLUDED.job_id, evaluation_type = EXCLUDED.evaluation_type,
    status = 'running', started_by = v_user, started_at = now(), execution_started_at = NULL,
    finished_at = NULL, result = NULL, error_message = NULL
  RETURNING ai_evaluation_jobs.job_id INTO job_id;
  claimed := true; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_ai_evaluation_job(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ai_evaluation_job(TEXT, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
