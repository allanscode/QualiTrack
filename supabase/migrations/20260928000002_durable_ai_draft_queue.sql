-- Keep completed AI drafts visible after a Zendesk view stops returning the ticket.
ALTER TABLE public.ai_evaluation_drafts
  ADD COLUMN IF NOT EXISTS source_queue TEXT CHECK (source_queue IN ('negativas', 'proativas', 'positivas')),
  ADD COLUMN IF NOT EXISTS ticket_snapshot JSONB;

CREATE INDEX IF NOT EXISTS ai_drafts_source_queue_updated_idx
  ON public.ai_evaluation_drafts (source_queue, updated_at DESC)
  WHERE source_queue IS NOT NULL;

CREATE OR REPLACE FUNCTION public.capture_ai_draft_ticket_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_queue TEXT; v_snapshot JSONB; v_preferred TEXT;
BEGIN
  v_preferred := NEW.source_queue;
  IF TG_OP = 'UPDATE' AND OLD.source_queue IS NOT NULL THEN v_preferred := OLD.source_queue; END IF;
  SELECT c.queue_type, c.ticket_snapshot INTO v_queue, v_snapshot
    FROM public.queue_ticket_catalog c
    WHERE c.ticket_id = NEW.ticket_id
      AND c.queue_type IN ('negativas', 'proativas', 'positivas')
      AND c.ticket_snapshot IS NOT NULL
    ORDER BY (c.queue_type = v_preferred) DESC, c.verified_at DESC LIMIT 1;
  IF TG_OP = 'UPDATE' AND OLD.source_queue IS NOT NULL THEN
    NEW.source_queue := OLD.source_queue;
  ELSE
    NEW.source_queue := COALESCE(NEW.source_queue, v_queue);
  END IF;
  NEW.ticket_snapshot := COALESCE(v_snapshot, NEW.ticket_snapshot);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_ai_draft_ticket_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS capture_ai_draft_ticket_snapshot ON public.ai_evaluation_drafts;
CREATE TRIGGER capture_ai_draft_ticket_snapshot
  BEFORE INSERT OR UPDATE ON public.ai_evaluation_drafts
  FOR EACH ROW EXECUTE FUNCTION public.capture_ai_draft_ticket_snapshot();

WITH latest AS (
  SELECT DISTINCT ON (ticket_id) ticket_id, queue_type, ticket_snapshot
  FROM public.queue_ticket_catalog
  WHERE queue_type IN ('negativas', 'proativas', 'positivas')
    AND ticket_snapshot IS NOT NULL
  ORDER BY ticket_id, verified_at DESC
)
UPDATE public.ai_evaluation_drafts d SET
  source_queue = c.queue_type,
  ticket_snapshot = c.ticket_snapshot
FROM latest c
WHERE d.ticket_id = c.ticket_id
  AND (d.source_queue IS NULL OR d.ticket_snapshot IS NULL);

-- Preserve the selected queue when the ticket has appeared in several views.
CREATE OR REPLACE FUNCTION public.complete_ai_evaluation_execution(
  p_job_id UUID, p_caller_id UUID, p_result JSONB, p_draft JSONB DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_job public.ai_evaluation_jobs%ROWTYPE;
  v_form UUID; v_team UUID; v_agent UUID; v_guidelines UUID[]; v_source TEXT;
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
    SELECT c.queue_type INTO v_source FROM public.queue_ticket_catalog c
      WHERE c.ticket_id = v_job.ticket_id
        AND c.queue_type = p_draft->>'source_queue'
        AND c.queue_type IN ('negativas', 'proativas', 'positivas')
        AND c.ticket_snapshot IS NOT NULL;
    INSERT INTO public.ai_evaluation_drafts(ticket_id, form_id, agent_name, agent_email, agent_id, team_id,
      channel, satisfaction_comment, result, guideline_ids, created_by, source_queue)
    VALUES (v_job.ticket_id, v_form, p_draft->>'agent_name', p_draft->>'agent_email', v_agent, v_team,
      p_draft->>'channel', p_draft->>'satisfaction_comment', p_result, v_guidelines, v_job.started_by, v_source)
    ON CONFLICT (ticket_id) DO UPDATE SET form_id = EXCLUDED.form_id, agent_name = EXCLUDED.agent_name,
      agent_email = EXCLUDED.agent_email, agent_id = EXCLUDED.agent_id, team_id = EXCLUDED.team_id,
      channel = EXCLUDED.channel, satisfaction_comment = EXCLUDED.satisfaction_comment,
      result = EXCLUDED.result, guideline_ids = EXCLUDED.guideline_ids, created_by = EXCLUDED.created_by,
      source_queue = COALESCE(EXCLUDED.source_queue, public.ai_evaluation_drafts.source_queue);
  END IF;
  UPDATE public.ai_evaluation_jobs SET status = 'completed', phase = 'completed', finished_at = now(), result = p_result
    WHERE job_id = p_job_id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_ai_evaluation_execution(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ai_evaluation_execution(UUID, UUID, JSONB, JSONB) TO service_role;

-- A completed monitoria replaces its draft, including when saved from another screen.
CREATE OR REPLACE FUNCTION public.remove_completed_ai_draft()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.ticket_id IS NOT NULL AND NEW.active IS DISTINCT FROM false THEN
    DELETE FROM public.ai_evaluation_drafts WHERE ticket_id = btrim(NEW.ticket_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_completed_ai_draft() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS remove_completed_ai_draft ON public.monitorias;
CREATE TRIGGER remove_completed_ai_draft
  AFTER INSERT OR UPDATE OF ticket_id, active ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION public.remove_completed_ai_draft();

NOTIFY pgrst, 'reload schema';
