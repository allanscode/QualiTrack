BEGIN;

-- Once a PJ manager has submitted the required opinion, an expired Quality
-- turn is eligible for the existing automatic finalization rule as well.
CREATE OR REPLACE FUNCTION public.process_action_deadline_timeouts()
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE item record; quality_turn boolean;
BEGIN
  FOR item IN
    SELECT m.id,m.status,m.score,m.pj_review_required,m.form_id,m.form_snapshot
    FROM public.monitorias m
    WHERE m.active AND m.action_deadline_at < now()
      AND m.form_snapshot->>'legacy_source' IS DISTINCT FROM 'zendesk_child_note'
      AND m.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada',
        'pendente_revisao','aguardando_gestor_suporte','contestacao_negada')
      AND (
        NOT m.pj_review_required
        OR m.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada')
        OR (m.status='pendente_revisao' AND m.form_snapshot->>'automation'='positive_csat')
      )
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    quality_turn := item.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada');
    IF item.pj_review_required THEN
      PERFORM set_config('app.positive_ai_timeout',item.id::text,true);
    END IF;

    UPDATE public.monitorias SET status='concluida',
      score=item.score,
      resolution_type='automatic',concluded_at=now(),updated_at=now(),
      history=coalesce(history,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'action','Finalização Automática (Prazo)','by_id','system','by_name','Sistema Automático','at',now(),
        'note',CASE WHEN quality_turn THEN 'Monitoria concluída automaticamente por perda de prazo da Equipe de Qualidade. A pontuação e as respostas da ficha foram preservadas.'
          ELSE 'Monitoria concluída automaticamente por perda de prazo da Equipe de Suporte. A pontuação e as respostas da ficha foram preservadas.' END))
      WHERE id=item.id;

    IF item.pj_review_required THEN
      PERFORM set_config('app.positive_ai_timeout','',true);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.process_action_deadline_timeouts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_action_deadline_timeouts() TO service_role;

-- Repair the expired production item reported by the user. The closed Zendesk
-- ticket was separately verified as already having the correct positive
-- verdict and tags, so this changes QWP state only; no Zendesk write is made.
DO $$
DECLARE v_id uuid := 'c315a981-c56f-4efd-8081-90981015edb5'::uuid; v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.monitorias WHERE id=v_id) THEN
    RETURN;
  END IF;
  PERFORM set_config('app.positive_ai_timeout',v_id::text,true);
  UPDATE public.monitorias
  SET status='concluida', score=100, resolution_type='automatic',
      concluded_at=now(), updated_at=now(),
      history=coalesce(history,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'action','Finalização Automática (Prazo)','by_id','system','by_name','Sistema Automático','at',now(),
        'note','Monitoria aprovada automaticamente (nota 100%) por perda de prazo da Equipe de Qualidade.'))
  WHERE id=v_id AND ticket_id='180753' AND active IS TRUE
    AND status='aguardando_gestor_qualidade' AND pj_review_required IS TRUE
    AND action_deadline_at < now() AND score=100
    AND pj_review_kind='approval';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.positive_ai_timeout','',true);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Monitoria 180753 mudou ou não está elegível para conclusão automática; nenhuma correção foi aplicada.';
  END IF;
END $$;

COMMIT;
