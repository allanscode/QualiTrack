-- Read-only enrichment of authorized dashboard drilldowns. Never return log
-- prompts, dialogues, payloads or auditor identity to the browser.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_monitoria_ticket_context(p_monitoria_ids uuid[])
RETURNS TABLE(monitoria_id uuid, ticket_subject text, ticket_group_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user public.users%ROWTYPE;
BEGIN
  IF coalesce(cardinality(p_monitoria_ids), 0) > 100 THEN
    RAISE EXCEPTION 'Consulte no máximo 100 monitorias por vez.';
  END IF;
  SELECT * INTO v_user FROM public.users WHERE id = (SELECT auth.uid()) AND active;
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Usuário não autorizado.'; END IF;
  RETURN QUERY
  SELECT m.id,
    coalesce(nullif(m.form_snapshot->>'ticket_subject', ''),
      nullif(c.ticket_snapshot->>'subject', ''), l.ticket_subject),
    coalesce(nullif(m.form_snapshot->>'ticket_group_name', ''), g.name,
      nullif(c.ticket_snapshot->>'group_name', ''))
  FROM public.monitorias m
  LEFT JOIN public.teams g ON g.id = m.ticket_group_team_id
  LEFT JOIN LATERAL (
    SELECT catalog.ticket_snapshot FROM public.queue_ticket_catalog catalog
    WHERE catalog.ticket_id = m.ticket_id ORDER BY catalog.verified_at DESC LIMIT 1
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT log.ticket_subject FROM public.ai_evaluation_logs log
    WHERE log.ticket_id = m.ticket_id AND nullif(log.ticket_subject, '') IS NOT NULL
    ORDER BY log.created_at DESC LIMIT 1
  ) l ON true
  WHERE m.id = ANY(p_monitoria_ids) AND m.active IS DISTINCT FROM false
    AND (v_user.role IN ('admin', 'gestor_qualidade', 'qualidade')
      OR (v_user.role = 'suporte' AND m.evaluated_id = v_user.id)
      OR (v_user.role = 'gestor_suporte' AND EXISTS (
        SELECT 1 FROM public.user_teams ut WHERE ut.user_id = v_user.id AND ut.team_id = m.team_id)));
END;
$$;
REVOKE ALL ON FUNCTION public.get_monitoria_ticket_context(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monitoria_ticket_context(uuid[]) TO authenticated;
COMMIT;
