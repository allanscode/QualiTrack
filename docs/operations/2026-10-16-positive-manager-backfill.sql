-- One-time conversion after 20261016153322_positive_manager_as_evaluated_agent.
-- These 13 historic tickets were excluded solely because the evaluated agent
-- has the support-manager role. Any drift aborts the entire transaction.
BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
DECLARE
  item record;
  saved record;
  converted integer := 0;
BEGIN
  IF (
    SELECT count(*)
    FROM public.positive_ai_queue q
    JOIN public.ai_evaluation_jobs j ON j.job_id = q.job_id AND j.status = 'completed'
    JOIN public.ai_evaluation_drafts d ON d.ticket_id = q.ticket_id
    JOIN public.users agent ON agent.id = d.agent_id
      AND agent.active AND agent.role = 'gestor_suporte' AND agent.primary_team_id IS NOT NULL
    JOIN public.users auditor ON auditor.id = q.auditor_id
      AND auditor.active AND auditor.role IN ('admin', 'qualidade', 'gestor_qualidade')
    WHERE q.ticket_id = ANY(ARRAY[
      '180794','181213','181353','181575','181808','181830','182426',
      '182771','182784','182813','183067','183138','184505'])
      AND q.status = 'review_required'
      AND q.last_error = 'Nota abaixo de 75% — revisão manual necessária.'
      AND d.form_id::text = q.form_snapshot->>'id'
      AND NOT EXISTS (SELECT 1 FROM public.monitorias m WHERE m.ticket_id = q.ticket_id AND m.active)
      AND EXISTS (SELECT 1 FROM jsonb_each(coalesce(d.result->'suggested_critical_errors','{}'::jsonb)) e
        WHERE e.value = 'true'::jsonb)
      AND coalesce(d.result->>'requires_human_review', 'false') = 'false'
      AND jsonb_array_length(coalesce(d.result->'review_reasons', '[]'::jsonb)) = 0
      AND length(btrim(d.result->>'summary')) BETWEEN 80 AND 3000
  ) <> 13 THEN
    RAISE EXCEPTION 'Os 13 tickets esperados mudaram; conversão cancelada.';
  END IF;

  FOR item IN
    SELECT q.ticket_id, q.job_id, d.result->>'summary' AS summary
    FROM public.positive_ai_queue q
    JOIN public.ai_evaluation_drafts d ON d.ticket_id = q.ticket_id
    WHERE q.ticket_id = ANY(ARRAY[
      '180794','181213','181353','181575','181808','181830','182426',
      '182771','182784','182813','183067','183138','184505'])
    ORDER BY q.ticket_id
    FOR UPDATE OF q
  LOOP
    UPDATE public.ai_evaluation_drafts
    SET result = result || jsonb_build_object(
      'auditor_record', btrim(item.summary),
      'auditor_record_source', 'legacy_ai_summary'
    ) WHERE ticket_id = item.ticket_id;
    UPDATE public.positive_ai_queue
    SET status = 'evaluating', updated_at = now()
    WHERE ticket_id = item.ticket_id AND status = 'review_required';
    IF NOT FOUND THEN RAISE EXCEPTION 'Fila mudou durante a conversão: %', item.ticket_id; END IF;
    PERFORM public.finish_positive_ai_job(item.job_id);
    SELECT m.id, m.status, m.score, m.pj_review_required, m.evaluator_note,
           m.evaluated_id, m.form_snapshot->>'review_route' AS review_route
    INTO saved
    FROM public.positive_ai_queue q
    JOIN public.monitorias m ON m.id = q.monitoria_id
    WHERE q.ticket_id = item.ticket_id AND q.status = 'completed';
    IF saved.id IS NULL OR saved.status <> 'pendente_revisao'
      OR saved.score <> 0 OR saved.pj_review_required IS TRUE
      OR saved.review_route <> 'standard_manager'
      OR saved.evaluator_note IS DISTINCT FROM btrim(item.summary) THEN
      RAISE EXCEPTION 'Resultado inesperado; transação cancelada para ticket %', item.ticket_id;
    END IF;
    converted := converted + 1;
  END LOOP;
  IF converted <> 13 THEN RAISE EXCEPTION 'Quantidade inesperada: %', converted; END IF;
  RAISE NOTICE 'Monitorias de gestor atendente enviadas ao fluxo comum: %', converted;
END $$;
COMMIT;
