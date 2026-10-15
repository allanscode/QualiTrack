BEGIN;

CREATE OR REPLACE FUNCTION public.finish_positive_ai_job(p_job_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  q positive_ai_queue%ROWTYPE; j ai_evaluation_jobs%ROWTYPE; d ai_evaluation_drafts%ROWTYPE;
  v_section jsonb; v_question jsonb; v_answer text; v_weight numeric; v_active integer;
  v_yes integer; v_total numeric:=0; v_weights numeric:=0; v_score numeric:=0; v_critical boolean:=false;
  v_reason text; v_id uuid; v_auditor users%ROWTYPE; v_agent users%ROWTYPE; v_team text; v_config jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.'; END IF;
  SELECT * INTO q FROM positive_ai_queue WHERE job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR q.status <> 'evaluating' THEN RETURN; END IF;
  SELECT * INTO j FROM ai_evaluation_jobs WHERE job_id=p_job_id;
  IF j.status IS DISTINCT FROM 'completed' THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('positive_ticket_'||q.ticket_id));
  SELECT id INTO v_id FROM monitorias WHERE ticket_id=q.ticket_id AND active LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE positive_ai_queue SET status='completed',monitoria_id=v_id,updated_at=now() WHERE ticket_id=q.ticket_id; RETURN;
  END IF;
  SELECT * INTO d FROM ai_evaluation_drafts WHERE ticket_id=q.ticket_id;
  SELECT * INTO v_auditor FROM users WHERE id=q.auditor_id AND active AND role IN ('admin','qualidade','gestor_qualidade');
  SELECT * INTO v_agent FROM users WHERE id=d.agent_id AND active AND role='suporte';
  IF d.id IS NULL OR d.form_id::text IS DISTINCT FROM q.form_snapshot->>'id'
    OR v_auditor.id IS NULL OR v_agent.id IS NULL OR v_agent.primary_team_id IS NULL THEN
    v_reason:='Ficha, agente, equipe ou auditor indisponível; revisão manual necessária.';
  ELSIF jsonb_typeof(q.form_snapshot->'sections') IS DISTINCT FROM 'array'
    OR jsonb_array_length(q.form_snapshot->'sections')=0 THEN v_reason:='Ficha sem critérios válidos.';
  ELSE
    FOR v_section IN SELECT value FROM jsonb_array_elements(q.form_snapshot->'sections') LOOP
      v_active:=0; v_yes:=0; v_weight:=coalesce((v_section->>'weight')::numeric,0);
      IF v_weight<=0 OR jsonb_typeof(v_section->'questions') IS DISTINCT FROM 'array'
        OR jsonb_array_length(v_section->'questions')=0 THEN v_reason:='Ficha com pesos ou critérios inválidos.'; EXIT; END IF;
      FOR v_question IN SELECT value FROM jsonb_array_elements(v_section->'questions') LOOP
        v_answer:=d.result#>>ARRAY['suggested_answers',v_question->>'id'];
        IF v_answer IS NULL OR v_answer NOT IN ('SIM','NAO','NA') THEN v_reason:='A IA não preencheu todos os critérios da ficha.'; EXIT; END IF;
        IF nullif(btrim(d.result#>>ARRAY['suggested_observations',v_question->>'id']),'') IS NULL THEN
          v_reason:='A IA não justificou todos os critérios da ficha.'; EXIT;
        END IF;
        IF coalesce((v_question->>'is_critical')::boolean,false)
          AND jsonb_typeof(d.result#>ARRAY['suggested_critical_errors',v_question->>'id']) IS DISTINCT FROM 'boolean' THEN
          v_reason:='A IA não verificou todos os erros críticos.'; EXIT;
        END IF;
        IF coalesce((v_question->>'is_critical')::boolean,false) AND v_answer='NAO' THEN v_critical:=true; END IF;
        IF v_answer <> 'NA' THEN v_active:=v_active+1; END IF;
        IF v_answer='SIM' THEN v_yes:=v_yes+1; END IF;
      END LOOP;
      EXIT WHEN v_reason IS NOT NULL;
      IF v_active>0 THEN v_total:=v_total+v_weight*v_yes/v_active; v_weights:=v_weights+v_weight; END IF;
    END LOOP;
    IF v_reason IS NULL THEN
      FOR v_question IN SELECT value FROM jsonb_array_elements(coalesce(q.form_snapshot->'critical_errors','[]'::jsonb)) LOOP
        IF jsonb_typeof(d.result#>ARRAY['suggested_critical_errors',v_question->>'id']) IS DISTINCT FROM 'boolean'
          OR nullif(btrim(d.result#>>ARRAY['suggested_observations',v_question->>'id']),'') IS NULL THEN
          v_reason:='A IA não verificou todos os erros críticos.'; EXIT;
        END IF;
      END LOOP;
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(coalesce(d.result->'suggested_critical_errors','{}')) WHERE value='true'::jsonb) THEN v_critical:=true; END IF;
    IF v_weights=0 AND v_reason IS NULL THEN v_reason:='Nenhum critério aplicável; revisão manual necessária.'; END IF;
    v_score:=CASE WHEN v_critical OR v_weights=0 THEN 0 ELSE round(v_total/v_weights*100,2) END;
    IF v_reason IS NULL AND d.result->>'requires_human_review'='true' THEN
      v_reason:='Evidência externa pendente: ' || coalesce((SELECT string_agg(value, '; ') FROM jsonb_array_elements_text(coalesce(d.result->'review_reasons','[]'::jsonb))), 'conferência manual necessária.');
    END IF;
  END IF;
  UPDATE ai_evaluation_drafts SET result=result || jsonb_build_object('score',v_score,'automatic_positive',true,
    'automation_review_reason',v_reason,'dialogue',coalesce(q.evaluation_payload->'dialogue','[]'::jsonb)),
    ticket_snapshot=q.ticket_snapshot,source_queue='positivas' WHERE ticket_id=q.ticket_id;
  UPDATE ai_evaluation_jobs SET result=result || jsonb_build_object('score',v_score,'automatic_positive',true,
    'automation_review_reason',v_reason) WHERE job_id=p_job_id;
  IF v_reason IS NOT NULL THEN
    UPDATE positive_ai_queue SET status='review_required',score=v_score,last_error=v_reason,updated_at=now(),evaluation_payload=NULL
      WHERE ticket_id=q.ticket_id; RETURN;
  END IF;
  SELECT name INTO v_team FROM teams WHERE id=v_agent.primary_team_id;
  SELECT config INTO v_config FROM quality_configs WHERE active ORDER BY updated_at DESC LIMIT 1;
  INSERT INTO monitorias(form_id,evaluator_id,evaluated_id,team_id,ticket_group_team_id,ticket_id,channel,ticket_date,analysis_date,
    satisfaction_result,satisfaction_has_record,satisfaction_record_text,answers,question_observations,selected_critical_errors,
    critical_error_observations,score,status,resolution_type,active,evaluator_note,form_snapshot,history,
    evaluator_name,evaluated_name,form_name,team_name,applied_config,action_deadline_at,concluded_at)
  VALUES(d.form_id,v_auditor.id,v_agent.id,v_agent.primary_team_id,nullif(q.ticket_snapshot->>'ticket_group_team_id','')::uuid,
    q.ticket_id,d.channel,nullif(q.ticket_snapshot->>'ticket_date','')::timestamptz::date,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,'Positiva',coalesce(d.satisfaction_comment,'')<>'',d.satisfaction_comment,
    d.result->'suggested_answers',coalesce(d.result->'suggested_observations','{}'),
    ARRAY(SELECT key FROM jsonb_each(coalesce(d.result->'suggested_critical_errors','{}')) WHERE value='true'::jsonb),
    coalesce((SELECT jsonb_object_agg(c->>'id',d.result#>ARRAY['suggested_observations',c->>'id'])
      FROM jsonb_array_elements(coalesce(q.form_snapshot->'critical_errors','[]'::jsonb)) c),'{}'::jsonb),
    v_score,CASE WHEN v_score>=75 THEN 'concluida' ELSE 'pendente_revisao' END,
    CASE WHEN v_score>=75 THEN 'automatic' ELSE NULL END,true,d.result->>'summary',
    q.form_snapshot || jsonb_build_object('ai_evaluation',d.result || jsonb_build_object('score',v_score,'automatic_positive',true,
      'dialogue',coalesce(q.evaluation_payload->'dialogue','[]'::jsonb)),
      'ticket_fields',coalesce(d.result->'ticket_fields','[]'::jsonb),'automation','positive_csat'),
    jsonb_build_array(jsonb_build_object('action',CASE WHEN v_score>=75
      THEN 'Monitoria avaliada e concluída automaticamente pela IA'
      ELSE 'Monitoria criada pela IA para revisão do gestor' END,
      'by_id',v_auditor.id,'by_name',v_auditor.name,'at',now(),'note','Automação de CSAT positivo. Nota calculada a partir dos critérios: '||v_score||'%. Auditor responsável configurado; não representa avaliação manual.')),
    v_auditor.name,v_agent.name,q.form_snapshot->>'title',v_team,v_config,
    CASE WHEN v_score>=75 THEN NULL ELSE public.calculate_action_deadline(now(),
      coalesce((v_config->'action_deadline'->>'agent_review')::numeric,50)) END,
    CASE WHEN v_score>=75 THEN now() ELSE NULL END) RETURNING id INTO v_id;
  UPDATE positive_ai_queue SET status='completed',score=v_score,monitoria_id=v_id,last_error=NULL,evaluation_payload=NULL,updated_at=now()
    WHERE ticket_id=q.ticket_id;
END $$;

-- AI monitorias below 75 enter the ordinary review flow. If the final
-- decision raises the score, publish the positive result only then.
CREATE OR REPLACE FUNCTION public.capture_positive_ai_final_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'concluida' AND NEW.status='concluida'
    AND NEW.active IS TRUE AND NEW.score>=75 AND NEW.score<=100
    AND NEW.satisfaction_result='Positiva' AND btrim(NEW.ticket_id) ~ '^[0-9]+$'
    AND NEW.form_snapshot->>'automation'='positive_csat' THEN
    INSERT INTO public.positive_auto_publications(monitoria_id,ticket_id,source)
      VALUES(NEW.id,btrim(NEW.ticket_id),'positive_csat')
      ON CONFLICT(monitoria_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_positive_ai_final_publication() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_positive_ai_final_publication AFTER UPDATE OF status ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION public.capture_positive_ai_final_publication();

-- Only AI positive PJ monitorias may expire before the manager's decision.
CREATE OR REPLACE FUNCTION public.enforce_pj_review_route()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_is_pj boolean;
BEGIN
  SELECT coalesce(t.requires_pj_review, false) INTO v_is_pj
  FROM public.teams t WHERE t.id = NEW.team_id;
  IF TG_OP = 'INSERT' THEN
    NEW.pj_review_required := coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE);
    IF NOT coalesce(v_is_pj, false) THEN RETURN NEW; END IF;
    IF NEW.pj_reviewer_id IS NOT NULL OR NEW.pj_review_kind IS NOT NULL
      OR NEW.pj_review_decision IS NOT NULL OR NEW.pj_review_note IS NOT NULL
      OR NEW.pj_reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'O parecer PJ não pode ser pré-preenchido.';
    END IF;
    IF NEW.pj_review_required AND NEW.status <> 'pendente_revisao' THEN
      RAISE EXCEPTION 'Monitorias PJ com nota inferior a 75 devem começar na revisão do gestor PJ.';
    ELSIF NOT NEW.pj_review_required AND NEW.status = 'pendente_revisao' THEN
      NEW.status := 'concluida';
      NEW.resolution_type := 'human';
      NEW.action_deadline_at := NULL;
      NEW.history := coalesce(NEW.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action', 'Monitoria concluída automaticamente por nota positiva PJ',
        'by_id', NULL, 'by_name', 'Sistema', 'at', now(),
        'note', 'Formulário anterior à atualização enviou status pendente; regra de nota positiva aplicada.'));
    ELSIF NOT NEW.pj_review_required AND NEW.status <> 'concluida' THEN
      RAISE EXCEPTION 'Monitorias PJ com nota igual ou superior a 75 devem ser concluídas.';
    END IF;
    RETURN NEW;
  END IF;

  NEW.pj_review_required := OLD.pj_review_required
    OR (coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE));
  IF OLD.pj_review_required AND OLD.active AND OLD.status='pendente_revisao'
    AND NEW.status='concluida' AND NEW.score=OLD.score
    AND NEW.resolution_type='automatic' AND OLD.action_deadline_at<now()
    AND OLD.form_snapshot->>'automation'='positive_csat'
    AND current_setting('app.positive_ai_timeout',true)=OLD.id::text
    AND coalesce(current_setting('request.jwt.claim.role',true),'') NOT IN ('anon','authenticated') THEN
    RETURN NEW;
  END IF;
  IF NOT NEW.pj_review_required THEN RETURN NEW; END IF;
  IF NOT OLD.pj_review_required AND NEW.status <> 'pendente_revisao' THEN
    RAISE EXCEPTION 'Monitorias PJ que passaram a ter nota inferior a 75 devem iniciar revisão do gestor PJ.';
  END IF;

  IF NEW.status = 'pendente_revisao' AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.pj_reviewer_id := NULL;
    NEW.pj_review_kind := NULL;
    NEW.pj_review_decision := NULL;
    NEW.pj_review_note := NULL;
    NEW.pj_reviewed_at := NULL;
  END IF;
  IF NEW.status = 'aguardando_revisao_pj' AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'A etapa de revisão PJ foi encerrada; o parecer segue direto para a Qualidade.';
  END IF;
  IF OLD.status IS DISTINCT FROM 'pendente_revisao'
    AND NEW.status = 'pendente_revisao' THEN
    IF (SELECT auth.uid()) IS NOT NULL
      AND _private.current_active_role() NOT IN ('admin','gestor_qualidade','qualidade') THEN
      RAISE EXCEPTION 'Somente a Qualidade pode reiniciar o fluxo PJ.';
    END IF;
  ELSIF (NEW.pj_reviewer_id, NEW.pj_review_kind) IS DISTINCT FROM
    (OLD.pj_reviewer_id, OLD.pj_review_kind)
    AND (SELECT auth.uid()) IS NOT NULL
    AND current_setting('app.pj_manager_action', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'O tipo de parecer PJ só pode ser registrado pela ação do gestor.';
  END IF;
  IF (NEW.pj_review_decision, NEW.pj_review_note, NEW.pj_reviewed_at) IS DISTINCT FROM
    (OLD.pj_review_decision, OLD.pj_review_note, OLD.pj_reviewed_at)
    AND NEW.status <> 'pendente_revisao'
    AND (SELECT auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'A etapa de parecer do revisor PJ foi encerrada.';
  END IF;
  IF NEW.status = 'aguardando_gestor_qualidade' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status NOT IN ('pendente_revisao','aguardando_gestor_suporte','aguardando_revisao_pj')
      OR NEW.pj_review_kind IS NULL THEN
      RAISE EXCEPTION 'O parecer do gestor PJ deve preceder a Gestão da Qualidade.';
    END IF;
    IF OLD.status <> 'aguardando_revisao_pj'
      AND current_setting('app.pj_manager_action', true) IS DISTINCT FROM OLD.id::text
      AND (SELECT auth.uid()) IS NOT NULL THEN
      RAISE EXCEPTION 'Somente a ação do gestor PJ pode encaminhar à Qualidade.';
    END IF;
  END IF;
  IF NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada',
      'em_contestacao','reavaliacao_solicitada')
    AND OLD.status IS DISTINCT FROM NEW.status AND NEW.pj_review_kind IS NULL THEN
    RAISE EXCEPTION 'Monitoria PJ aguarda o parecer do gestor antes da decisão final.';
  END IF;
  IF NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada')
    AND OLD.status IS DISTINCT FROM NEW.status
    AND OLD.status NOT IN ('aguardando_gestor_qualidade','reavaliacao_solicitada',
      'contestacao_negada','contestacao_aceita') THEN
    RAISE EXCEPTION 'A decisão da Qualidade deve preceder a conclusão PJ.';
  END IF;
  IF NEW.pj_review_kind = 'contestation'
    AND NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada')
    AND OLD.status IS DISTINCT FROM NEW.status
    AND coalesce(NEW.contestation_result, '') NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'A decisão final deve resolver a contestação PJ.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_pj_review_route() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.process_action_deadline_timeouts()
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE item record; quality_turn boolean;
BEGIN
  FOR item IN SELECT m.id,m.status,m.score,m.pj_review_required FROM public.monitorias m
    WHERE m.active AND m.action_deadline_at < now()
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

COMMIT;
