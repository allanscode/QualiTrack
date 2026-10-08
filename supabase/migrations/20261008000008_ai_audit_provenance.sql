BEGIN;

-- A manual monitoria predating the AI run is not AI-generated. Automatic
-- monitorias can be committed just before their success log is written.
CREATE OR REPLACE FUNCTION public.get_ai_audit_summary()
RETURNS TABLE (
  evaluated_tickets bigint,
  generated_monitorias bigint,
  concluded_monitorias bigint,
  awaiting_review bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.active
      AND u.role IN ('admin', 'gestor_qualidade')
  ) THEN
    RAISE EXCEPTION 'Acesso restrito à gestão da qualidade.';
  END IF;

  RETURN QUERY
  WITH evaluated AS (
    SELECT l.ticket_id, min(l.created_at) AS first_ai_at
    FROM public.ai_evaluation_logs l
    WHERE l.status = 'success'
      AND l.provider <> 'zendesk_webhook'
      AND l.evaluation_type IN ('atendimento', 'chamado_filho')
    GROUP BY l.ticket_id
  ), generated AS (
    SELECT m.id, m.status
    FROM public.monitorias m
    JOIN evaluated e ON e.ticket_id = m.ticket_id
    WHERE m.active AND (
      m.created_at >= e.first_ai_at
      OR m.form_snapshot->>'automation' IN ('positive_csat', 'child_ticket')
    )
  ), review AS (
    SELECT DISTINCT d.ticket_id
    FROM public.ai_evaluation_drafts d
    JOIN evaluated e ON e.ticket_id = d.ticket_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.monitorias m
      WHERE m.ticket_id = d.ticket_id AND m.active
    )
  )
  SELECT
    (SELECT count(*) FROM evaluated),
    (SELECT count(*) FROM generated),
    (SELECT count(*) FROM generated WHERE status IN (
      'concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'
    )),
    (SELECT count(*) FROM review);
END;
$$;

COMMIT;
