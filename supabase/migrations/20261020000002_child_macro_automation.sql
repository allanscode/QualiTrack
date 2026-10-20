-- Route automatic child jobs to the four macro forms and persist a binary verdict.
BEGIN;

-- In-flight jobs that froze the historical rubric must retain its original writer.
ALTER FUNCTION public.finish_child_ai_job(uuid) RENAME TO finish_legacy_child_ai_job;

CREATE OR REPLACE FUNCTION public.start_child_ai_job(p_ticket_id text,p_lease_id uuid,p_payload jsonb,p_form_snapshot jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q child_ai_queue%ROWTYPE; v_job uuid; v_agent uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai_job_'||p_ticket_id));
  SELECT * INTO q FROM child_ai_queue WHERE ticket_id=p_ticket_id FOR UPDATE;
  IF q.ticket_id IS NULL OR q.status <> 'preparing' OR q.lease_id IS DISTINCT FROM p_lease_id OR q.lease_until < now() THEN
    RAISE EXCEPTION 'Reserva da avaliação expirada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM child_ai_config WHERE enabled)
    OR NOT EXISTS (SELECT 1 FROM users u JOIN auth.users a ON a.id=u.id WHERE u.id=q.auditor_id
      AND u.active AND u.role IN ('admin','qualidade','gestor_qualidade')) THEN RAISE EXCEPTION 'Auditor da automação indisponível.'; END IF;
  IF EXISTS(SELECT 1 FROM monitorias WHERE ticket_id=p_ticket_id AND active)
    OR EXISTS(SELECT 1 FROM ai_evaluation_drafts WHERE ticket_id=p_ticket_id)
    OR EXISTS(SELECT 1 FROM ai_evaluation_jobs WHERE ticket_id=p_ticket_id AND status='completed') THEN
    UPDATE child_ai_queue SET status='skipped',last_error='O ticket já possui ficha ou parecer; preservado para revisão humana.',lease_until=NULL,updated_at=now() WHERE ticket_id=p_ticket_id;
    RETURN NULL;
  END IF;
  IF EXISTS(SELECT 1 FROM ai_evaluation_jobs WHERE ticket_id=p_ticket_id AND status='running') THEN
    UPDATE child_ai_queue SET status='pending',next_attempt_at=now()+interval '5 minutes',lease_until=NULL,updated_at=now() WHERE ticket_id=p_ticket_id;
    RETURN NULL;
  END IF;
  v_agent := (p_payload#>>'{draft_meta,agent_id}')::uuid;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=v_agent AND active AND role='suporte' AND primary_team_id IS NOT NULL)
    OR p_payload#>>'{draft_meta,source_queue}' IS DISTINCT FROM 'filhos'
    OR p_form_snapshot->>'id' NOT IN ('6c7d1e88-841b-4da9-9a66-9f1464ce8970','6c7d1e88-841b-4da9-9a66-9f1464ce8971','6c7d1e88-841b-4da9-9a66-9f1464ce8972','6c7d1e88-841b-4da9-9a66-9f1464ce8973')
    OR p_form_snapshot->>'id' IS DISTINCT FROM p_payload#>>'{draft_meta,form_id}'
    OR jsonb_typeof(p_form_snapshot->'sections') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Agente ou ficha inválidos.'; END IF;
  -- Optional environment budget: staging uses a finite total, production may
  -- leave this NULL. Reserve atomically so overlapping workers cannot exceed it.
  UPDATE positive_ai_config SET executions_started=executions_started+1
    WHERE max_evaluations IS NULL OR executions_started<max_evaluations;
  IF NOT FOUND THEN
    UPDATE child_ai_queue SET status='pending',lease_until=NULL,next_attempt_at=now()+interval '1 hour',
      last_error='Limite de avaliações automáticas deste ambiente atingido.',updated_at=now() WHERE ticket_id=p_ticket_id;
    RETURN NULL;
  END IF;
  UPDATE positive_ai_config SET enabled=false,last_error='Limite de avaliações automáticas deste ambiente atingido.'
    WHERE max_evaluations IS NOT NULL AND executions_started>=max_evaluations;
  UPDATE child_ai_config SET enabled=false WHERE EXISTS(SELECT 1 FROM positive_ai_config WHERE max_evaluations IS NOT NULL AND executions_started>=max_evaluations);
  v_job := gen_random_uuid();
  INSERT INTO ai_evaluation_jobs(ticket_id,job_id,evaluation_type,status,phase,started_by,execution_started_at)
    VALUES(p_ticket_id,v_job,'chamado_filho','running','pending',q.auditor_id,now())
    ON CONFLICT(ticket_id) DO UPDATE SET job_id=EXCLUDED.job_id,evaluation_type='chamado_filho',status='running',phase='pending',
      started_by=EXCLUDED.started_by,started_at=now(),execution_started_at=now(),finished_at=NULL,result=NULL,error_message=NULL;
  p_payload := p_payload || jsonb_build_object('job_id',v_job,'ticket_id',p_ticket_id);
  UPDATE child_ai_queue SET status='evaluating',job_id=v_job,form_snapshot=p_form_snapshot,evaluation_payload=p_payload,
    lease_until=NULL,updated_at=now(),last_error=NULL WHERE ticket_id=p_ticket_id;
  INSERT INTO ai_evaluation_retry_queue(ticket_id,job_id,payload,next_retry_at)
    VALUES(p_ticket_id,v_job,p_payload,now()+interval '5 minutes')
    ON CONFLICT(ticket_id) DO UPDATE SET job_id=EXCLUDED.job_id,payload=EXCLUDED.payload,next_retry_at=EXCLUDED.next_retry_at,
      retry_count=0,lease_id=NULL,lease_until=NULL,last_error=NULL;
  RETURN v_job;
END $$;

CREATE OR REPLACE FUNCTION public.finish_child_ai_job(p_job_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  q child_ai_queue%ROWTYPE; j ai_evaluation_jobs%ROWTYPE; d ai_evaluation_drafts%ROWTYPE;
  v_section jsonb; v_question jsonb; v_answer text;
  v_reason text; v_id uuid; v_auditor users%ROWTYPE; v_agent users%ROWTYPE; v_team text; v_config jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.'; END IF;
  SELECT * INTO q FROM child_ai_queue WHERE job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR q.status <> 'evaluating' THEN RETURN; END IF;
  IF q.form_snapshot->>'id' = '6c7d1e88-841b-4da9-9a66-9f1464ce896f' THEN
    PERFORM public.finish_legacy_child_ai_job(p_job_id);
    RETURN;
  END IF;
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
    (j.result - 'score') || jsonb_build_object('suggested_answers','{}'::jsonb,'suggested_observations','{}'::jsonb,
      'suggested_critical_errors','{}'::jsonb,'strengths','[]'::jsonb,'improvements',coalesce(j.result->'recommendations','[]'::jsonb),
      'automatic_child',true,'child_evaluation',j.result),
    '{}'::uuid[],q.auditor_id,'filhos',q.ticket_snapshot);
  IF jsonb_typeof(j.result->'checks') IS DISTINCT FROM 'array' THEN
    v_reason:='Parecer sem criterios completos; revisao manual necessaria.';
  ELSIF jsonb_typeof(q.form_snapshot->'sections') IS DISTINCT FROM 'array' THEN
    v_reason:='Ficha sem criterios validos; revisao manual necessaria.';
  ELSIF jsonb_array_length(j.result->'checks') IS DISTINCT FROM (
    SELECT count(*) FROM jsonb_array_elements(q.form_snapshot->'sections') section,
      jsonb_array_elements(section->'questions') question
  ) OR (SELECT count(DISTINCT value->>'question_id') FROM jsonb_array_elements(j.result->'checks')) IS DISTINCT FROM (
    SELECT count(*) FROM jsonb_array_elements(q.form_snapshot->'sections') section,
      jsonb_array_elements(section->'questions') question
  ) THEN
    v_reason:='Parecer sem os criterios unicos da ficha; revisao manual necessaria.';
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
      IF jsonb_typeof(v_section->'questions') IS DISTINCT FROM 'array'
        OR jsonb_array_length(v_section->'questions')=0 THEN v_reason:='Ficha sem critérios válidos.'; EXIT; END IF;
      FOR v_question IN SELECT value FROM jsonb_array_elements(v_section->'questions') LOOP
        v_answer:=d.result#>>ARRAY['suggested_answers',v_question->>'id'];
        IF v_answer IS NULL OR v_answer NOT IN ('SIM','NAO','NA') THEN v_reason:='A IA não preencheu todos os critérios da ficha.'; EXIT; END IF;
        IF nullif(btrim(d.result#>>ARRAY['suggested_observations',v_question->>'id']),'') IS NULL THEN
          v_reason:='A IA não justificou todos os critérios da ficha.'; EXIT;
        END IF;
      END LOOP;
      EXIT WHEN v_reason IS NOT NULL;
    END LOOP;
    IF v_reason IS NULL AND (j.result->>'status'='atencao' OR j.result->>'detected_type'='desconhecido'
      OR EXISTS(SELECT 1 FROM jsonb_each_text(coalesce(d.result->'suggested_answers','{}')) WHERE value='NA')) THEN
      v_reason:='Evidencia insuficiente ou criterio nao aplicavel; revisao manual necessaria.';
    END IF;
    IF v_reason IS NULL AND j.result->>'status' IS DISTINCT FROM 'conforme' THEN
      v_reason:='Parecer nao conforme ou inconclusivo; revisao manual necessaria.';
    END IF;
    IF v_reason IS NULL AND d.result->>'requires_human_review'='true' THEN
      v_reason:='Evidência externa pendente: ' || coalesce((SELECT string_agg(value, '; ') FROM jsonb_array_elements_text(coalesce(d.result->'review_reasons','[]'::jsonb))), 'conferência manual necessária.');
    END IF;
    IF v_reason IS NULL AND EXISTS(SELECT 1 FROM jsonb_each_text(coalesce(d.result->'suggested_answers','{}')) WHERE value <> 'SIM') THEN
      v_reason:='Critério não atendido; revisão manual necessária.';
    END IF;
  END IF;
  UPDATE ai_evaluation_drafts SET result=result || jsonb_build_object('automatic_child',true,
    'automation_review_reason',v_reason,'dialogue',coalesce(q.evaluation_payload->'dialogue','[]'::jsonb)),
    ticket_snapshot=q.ticket_snapshot,source_queue='filhos' WHERE ticket_id=q.ticket_id;
  UPDATE ai_evaluation_jobs SET result=(result - 'score') || jsonb_build_object('automatic_child',true,
    'automation_review_reason',v_reason) WHERE job_id=p_job_id;
  IF v_reason IS NOT NULL THEN
    UPDATE child_ai_queue SET status='review_required',score=NULL,last_error=v_reason,updated_at=now(),evaluation_payload=NULL
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
    ARRAY[]::text[],
    coalesce((SELECT jsonb_object_agg(c->>'id',d.result#>ARRAY['suggested_observations',c->>'id'])
      FROM jsonb_array_elements(coalesce(q.form_snapshot->'critical_errors','[]'::jsonb)) c),'{}'::jsonb),
    NULL,'concluida','automatic',true,d.result->>'summary',
    q.form_snapshot || jsonb_build_object('ticket_kind','chamado_filho','child_verdict','valido','child_macro_type',q.ticket_snapshot->>'child_macro_type','child_ai_evaluation',j.result - 'score','ai_evaluation',d.result || jsonb_build_object('automatic_child',true,
      'dialogue',coalesce(q.evaluation_payload->'dialogue','[]'::jsonb)),
      'ticket_fields',coalesce(d.result->'ticket_fields','[]'::jsonb),'automation','child_ticket'),
    jsonb_build_array(jsonb_build_object('action','Monitoria avaliada e concluída automaticamente pela IA',
      'by_id',v_auditor.id,'by_name',v_auditor.name,'at',now(),'note','Automação de tickets filhos. Todos os critérios atendidos; auditor responsável configurado.')),
    v_auditor.name,v_agent.name,q.form_snapshot->>'title',v_team,v_config,now()) RETURNING id INTO v_id;
  UPDATE child_ai_queue SET status='completed',score=NULL,monitoria_id=v_id,last_error=NULL,evaluation_payload=NULL,updated_at=now()
    WHERE ticket_id=q.ticket_id;
END $$;

COMMIT;
