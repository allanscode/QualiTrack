BEGIN;

CREATE OR REPLACE FUNCTION public.finish_child_ai_job(p_job_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  q child_ai_queue%ROWTYPE; j ai_evaluation_jobs%ROWTYPE; d ai_evaluation_drafts%ROWTYPE;
  v_section jsonb; v_question jsonb; v_answer text; v_weight numeric; v_active integer;
  v_yes integer; v_total numeric:=0; v_weights numeric:=0; v_score numeric:=0; v_critical boolean:=false;
  v_reason text; v_id uuid; v_auditor users%ROWTYPE; v_agent users%ROWTYPE; v_team text; v_config jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.'; END IF;
  SELECT * INTO q FROM child_ai_queue WHERE job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR q.status <> 'evaluating' THEN RETURN; END IF;
  SELECT * INTO j FROM ai_evaluation_jobs WHERE job_id=p_job_id;
  IF j.status IS DISTINCT FROM 'completed' THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('child_ticket_'||q.ticket_id));
  SELECT id INTO v_id FROM monitorias WHERE ticket_id=q.ticket_id AND active LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE child_ai_queue SET status='completed',monitoria_id=v_id,updated_at=now() WHERE ticket_id=q.ticket_id; RETURN;
  END IF;
  -- Child jobs do not use the generic atendimento draft writer. Convert only
  -- their frozen, completed result; never overwrite another human/AI draft.
  IF EXISTS(SELECT 1 FROM ai_evaluation_drafts WHERE ticket_id=q.ticket_id) THEN
    UPDATE child_ai_queue SET status='review_required',last_error='Parecer existente preservado; revisao manual necessaria.',updated_at=now() WHERE ticket_id=q.ticket_id;
    RETURN;
  END IF;
  INSERT INTO ai_evaluation_drafts(ticket_id,form_id,agent_id,agent_name,agent_email,team_id,channel,
    satisfaction_comment,result,guideline_ids,created_by,source_queue,ticket_snapshot)
  VALUES(q.ticket_id,(q.form_snapshot->>'id')::uuid,(q.evaluation_payload#>>'{draft_meta,agent_id}')::uuid,
    q.evaluation_payload#>>'{draft_meta,agent_name}',q.evaluation_payload#>>'{draft_meta,agent_email}',
    (q.evaluation_payload#>>'{draft_meta,team_id}')::uuid,q.evaluation_payload#>>'{draft_meta,channel}','',
    j.result || jsonb_build_object('suggested_answers','{}'::jsonb,'suggested_observations','{}'::jsonb,
      'suggested_critical_errors','{}'::jsonb,'strengths','[]'::jsonb,'improvements',coalesce(j.result->'recommendations','[]'::jsonb),
      'automatic_child',true,'child_evaluation',j.result),
    '{}'::uuid[],q.auditor_id,'filhos',q.ticket_snapshot);
  IF jsonb_typeof(j.result->'checks') IS DISTINCT FROM 'array' THEN
    v_reason:='Parecer sem criterios completos; revisao manual necessaria.';
  ELSIF jsonb_array_length(j.result->'checks')<>5 OR (SELECT count(DISTINCT value->>'question_id') FROM jsonb_array_elements(j.result->'checks'))<>5 THEN
    v_reason:='Parecer sem cinco criterios unicos; revisao manual necessaria.';
  ELSE
    UPDATE ai_evaluation_drafts SET result=result || jsonb_build_object(
      'suggested_answers',(SELECT jsonb_object_agg(value->>'question_id',value->'answer') FROM jsonb_array_elements(j.result->'checks') WHERE value->>'question_id' IS NOT NULL),
      'suggested_observations',(SELECT jsonb_object_agg(value->>'question_id',value->'details') FROM jsonb_array_elements(j.result->'checks') WHERE value->>'question_id' IS NOT NULL),
      'suggested_critical_errors',(SELECT coalesce(jsonb_object_agg(question->>'id',coalesce(check_item->>'answer'='NAO',false)),'{}'::jsonb)
        FROM jsonb_array_elements(q.form_snapshot->'sections') section,
          jsonb_array_elements(section->'questions') question
        LEFT JOIN LATERAL (SELECT value check_item FROM jsonb_array_elements(j.result->'checks') WHERE value->>'question_id'=question->>'id') matched ON true
        WHERE question->>'is_critical'='true')) WHERE ticket_id=q.ticket_id;
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
    IF v_reason IS NULL AND (j.result->>'status'='atencao' OR j.result->>'detected_type'='desconhecido'
      OR EXISTS(SELECT 1 FROM jsonb_each_text(coalesce(d.result->'suggested_answers','{}')) WHERE value='NA')) THEN
      v_reason:='Evidencia insuficiente ou criterio nao aplicavel; revisao manual necessaria.';
    END IF;
    IF v_reason IS NULL AND d.result->>'requires_human_review'='true' THEN
      v_reason:='Evidência externa pendente: ' || coalesce((SELECT string_agg(value, '; ') FROM jsonb_array_elements_text(coalesce(d.result->'review_reasons','[]'::jsonb))), 'conferência manual necessária.');
    END IF;
    IF v_reason IS NULL AND v_critical THEN
      v_reason:='Erro crítico identificado; revisão manual necessária.';
    END IF;
    -- Child tickets use the Conforme/Nao Conforme verdict. Their numeric score
    -- remains on the form, but does not determine automatic completion.
    IF v_reason IS NULL AND j.result->>'status' IS DISTINCT FROM 'conforme' THEN
      v_reason:='Parecer nao conforme ou inconclusivo; revisao manual necessaria.';
    END IF;
  END IF;
  UPDATE ai_evaluation_drafts SET result=result || jsonb_build_object('score',v_score,'automatic_child',true,
    'automation_review_reason',v_reason,'dialogue',coalesce(q.evaluation_payload->'dialogue','[]'::jsonb)),
    ticket_snapshot=q.ticket_snapshot,source_queue='filhos' WHERE ticket_id=q.ticket_id;
  UPDATE ai_evaluation_jobs SET result=result || jsonb_build_object('score',v_score,'automatic_child',true,
    'automation_review_reason',v_reason) WHERE job_id=p_job_id;
  IF v_reason IS NOT NULL THEN
    UPDATE child_ai_queue SET status='review_required',score=v_score,last_error=v_reason,updated_at=now(),evaluation_payload=NULL
      WHERE ticket_id=q.ticket_id; RETURN;
  END IF;
  SELECT name INTO v_team FROM teams WHERE id=v_agent.primary_team_id;
  SELECT config INTO v_config FROM quality_configs WHERE active ORDER BY updated_at DESC LIMIT 1;
  INSERT INTO monitorias(form_id,evaluator_id,evaluated_id,team_id,ticket_group_team_id,ticket_id,channel,ticket_date,analysis_date,
    satisfaction_result,satisfaction_has_record,satisfaction_record_text,answers,question_observations,selected_critical_errors,
    critical_error_observations,score,status,resolution_type,active,evaluator_note,form_snapshot,history,
    evaluator_name,evaluated_name,form_name,team_name,applied_config,concluded_at)
  VALUES(d.form_id,v_auditor.id,v_agent.id,v_agent.primary_team_id,nullif(q.ticket_snapshot->>'ticket_group_team_id','')::uuid,
    q.ticket_id,d.channel,nullif(q.ticket_snapshot->>'ticket_date','')::timestamptz::date,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,'Sem pesquisa',coalesce(d.satisfaction_comment,'')<>'',d.satisfaction_comment,
    d.result->'suggested_answers',coalesce(d.result->'suggested_observations','{}'),
    ARRAY(SELECT key FROM jsonb_each(coalesce(d.result->'suggested_critical_errors','{}')) WHERE value='true'::jsonb),
    coalesce((SELECT jsonb_object_agg(c->>'id',d.result#>ARRAY['suggested_observations',c->>'id'])
      FROM jsonb_array_elements(coalesce(q.form_snapshot->'critical_errors','[]'::jsonb)) c),'{}'::jsonb),
    v_score,'concluida','automatic',true,d.result->>'summary',
    q.form_snapshot || jsonb_build_object('ticket_kind','chamado_filho','child_ai_evaluation',j.result,'ai_evaluation',d.result || jsonb_build_object('score',v_score,'automatic_child',true,
      'dialogue',coalesce(q.evaluation_payload->'dialogue','[]'::jsonb)),
      'ticket_fields',coalesce(d.result->'ticket_fields','[]'::jsonb),'automation','child_ticket'),
    jsonb_build_array(jsonb_build_object('action','Monitoria avaliada e concluída automaticamente pela IA',
      'by_id',v_auditor.id,'by_name',v_auditor.name,'at',now(),'note','Automação de tickets filhos. Nota calculada a partir dos critérios: '||v_score||'%. Auditor responsável configurado; não representa avaliação manual.')),
    v_auditor.name,v_agent.name,q.form_snapshot->>'title',v_team,v_config,now()) RETURNING id INTO v_id;
  UPDATE child_ai_queue SET status='completed',score=v_score,monitoria_id=v_id,last_error=NULL,evaluation_payload=NULL,updated_at=now()
    WHERE ticket_id=q.ticket_id;
END $$;


COMMIT;
