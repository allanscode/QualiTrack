-- Explicit action to create another child-ticket evaluation from a fresh AI report.
-- Preserve monitorias and the existing assignment ownership/locking checks.
CREATE OR REPLACE FUNCTION public.start_child_ticket_new_evaluation(p_ticket_id TEXT)
RETURNS TABLE (
  ticket_id TEXT, queue_type TEXT, assigned_to UUID, status TEXT,
  assignment_source TEXT, started_at TIMESTAMPTZ, started_by UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_assignment public.queue_ticket_assignments%ROWTYPE;
BEGIN
  IF NOT _private.is_quality_team_user() THEN
    RAISE EXCEPTION 'Apenas a equipe de Qualidade pode iniciar uma avaliação.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('qwp_queue_distribution'));
  SELECT a.* INTO v_assignment FROM public.queue_ticket_assignments a
    WHERE a.ticket_id = p_ticket_id AND a.queue_type = 'filhos' FOR UPDATE;
  IF v_assignment.id IS NULL THEN RAISE EXCEPTION 'Ticket sem monitor responsável.'; END IF;
  IF v_assignment.assigned_to <> auth.uid() AND NOT _private.is_admin_user() THEN
    RAISE EXCEPTION 'Este ticket está atribuído a outro monitor.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.monitorias m
    WHERE m.ticket_id = p_ticket_id AND m.active IS DISTINCT FROM FALSE) THEN
    RAISE EXCEPTION 'Não existe monitoria anterior ativa para este ticket.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_evaluation_jobs j
    WHERE j.ticket_id = p_ticket_id AND j.evaluation_type = 'chamado_filho'
      AND j.status = 'completed' AND j.result IS NOT NULL) THEN
    RAISE EXCEPTION 'Aguarde a conclusão da análise de IA antes de abrir a nova ficha.';
  END IF;
  IF v_assignment.status = 'completed' THEN
    UPDATE public.queue_ticket_assignments a
      SET status = 'pending', completed_at = NULL, started_at = NULL, started_by = NULL
      WHERE a.id = v_assignment.id;
  END IF;
  RETURN QUERY SELECT * FROM public.start_queue_ticket_assignment(p_ticket_id, 'filhos');
END;
$$;
REVOKE ALL ON FUNCTION public.start_child_ticket_new_evaluation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_child_ticket_new_evaluation(TEXT) TO authenticated;
