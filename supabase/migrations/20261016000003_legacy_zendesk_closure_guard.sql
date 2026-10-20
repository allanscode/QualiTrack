-- Legacy child assessments follow the Zendesk ticket closure, not the QWP
-- action deadline timer. Their displayed deadline is the Zendesk estimate.
CREATE OR REPLACE FUNCTION public.process_action_deadline_timeouts()
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE item record; quality_turn boolean;
BEGIN
  FOR item IN SELECT m.id,m.status,m.score,m.pj_review_required FROM public.monitorias m
    WHERE m.active AND m.action_deadline_at < now()
      AND m.form_snapshot->>'legacy_source' IS DISTINCT FROM 'zendesk_child_note'
      AND m.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada',
        'pendente_revisao','aguardando_gestor_suporte','contestacao_negada')
      AND (NOT m.pj_review_required OR (m.pj_review_required
        AND m.status='pendente_revisao' AND m.form_snapshot->>'automation'='positive_csat'))
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    quality_turn := item.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada');
    IF item.pj_review_required THEN
      PERFORM set_config('app.positive_ai_timeout',item.id::text,true);
    END IF;
    UPDATE public.monitorias SET status = 'concluida',
      score = CASE WHEN quality_turn THEN 100 ELSE item.score END,
      resolution_type = 'automatic', concluded_at = now(), updated_at = now(),
      history = coalesce(history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action','Finalização Automática (Prazo)', 'by_id','system', 'by_name','Sistema Automático', 'at',now(),
        'note',CASE WHEN quality_turn THEN 'Monitoria aprovada automaticamente (nota 100%) por perda de prazo da Equipe de Qualidade.'
          ELSE 'Monitoria aprovada automaticamente por perda de prazo da Equipe de Suporte.' END))
    WHERE id = item.id;
    IF item.pj_review_required THEN
      PERFORM set_config('app.positive_ai_timeout','',true);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.process_action_deadline_timeouts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_action_deadline_timeouts() TO service_role;
