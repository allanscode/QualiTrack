-- Remove the per-agent monthly cap; retain environment budgets and duplicate protection.
BEGIN;

CREATE OR REPLACE FUNCTION public.start_positive_ai_job(p_ticket_id text,p_lease_id uuid,p_payload jsonb,p_form_snapshot jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q positive_ai_queue%ROWTYPE; v_job uuid; v_agent uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai_job_'||p_ticket_id));
  SELECT * INTO q FROM positive_ai_queue WHERE ticket_id=p_ticket_id FOR UPDATE;
  IF q.status <> 'preparing' OR q.lease_id IS DISTINCT FROM p_lease_id OR q.lease_until < now() THEN
    RAISE EXCEPTION 'Reserva da avaliação expirada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM positive_ai_config WHERE enabled)
    OR NOT EXISTS (SELECT 1 FROM users u JOIN auth.users a ON a.id=u.id WHERE u.id=q.auditor_id
      AND u.active AND u.role IN ('admin','qualidade','gestor_qualidade')) THEN RAISE EXCEPTION 'Auditor da automação indisponível.'; END IF;
  IF EXISTS(SELECT 1 FROM monitorias WHERE ticket_id=p_ticket_id AND active)
    OR EXISTS(SELECT 1 FROM ai_evaluation_drafts WHERE ticket_id=p_ticket_id) THEN
    UPDATE positive_ai_queue SET status='skipped',last_error='O ticket já possui ficha ou parecer; preservado para revisão humana.',lease_until=NULL,updated_at=now() WHERE ticket_id=p_ticket_id;
    RETURN NULL;
  END IF;
  IF EXISTS(SELECT 1 FROM ai_evaluation_jobs WHERE ticket_id=p_ticket_id AND status='running') THEN
    UPDATE positive_ai_queue SET status='pending',next_attempt_at=now()+interval '5 minutes',lease_until=NULL,updated_at=now() WHERE ticket_id=p_ticket_id;
    RETURN NULL;
  END IF;
  v_agent := (p_payload#>>'{draft_meta,agent_id}')::uuid;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=v_agent AND active AND role='suporte' AND primary_team_id IS NOT NULL)
    OR p_payload#>>'{draft_meta,source_queue}' IS DISTINCT FROM 'positivas'
    OR p_form_snapshot->>'id' IS DISTINCT FROM p_payload#>>'{draft_meta,form_id}'
    OR jsonb_typeof(p_form_snapshot->'sections') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Agente ou ficha inválidos.'; END IF;
  -- Optional environment budget: staging uses a finite total, production may
  -- leave this NULL. Reserve atomically so overlapping workers cannot exceed it.
  UPDATE positive_ai_config SET executions_started=executions_started+1
    WHERE enabled AND (max_evaluations IS NULL OR executions_started<max_evaluations);
  IF NOT FOUND THEN
    UPDATE positive_ai_queue SET status='pending',lease_until=NULL,next_attempt_at=now()+interval '1 hour',
      last_error='Limite de avaliações automáticas deste ambiente atingido.',updated_at=now() WHERE ticket_id=p_ticket_id;
    RETURN NULL;
  END IF;
  UPDATE positive_ai_config SET enabled=false,last_error='Limite de avaliações automáticas deste ambiente atingido.'
    WHERE max_evaluations IS NOT NULL AND executions_started>=max_evaluations;
  v_job := gen_random_uuid();
  INSERT INTO ai_evaluation_jobs(ticket_id,job_id,evaluation_type,status,phase,started_by,execution_started_at)
    VALUES(p_ticket_id,v_job,'atendimento','running','pending',q.auditor_id,now())
    ON CONFLICT(ticket_id) DO UPDATE SET job_id=EXCLUDED.job_id,evaluation_type='atendimento',status='running',phase='pending',
      started_by=EXCLUDED.started_by,started_at=now(),execution_started_at=now(),finished_at=NULL,result=NULL,error_message=NULL;
  p_payload := p_payload || jsonb_build_object('job_id',v_job,'ticket_id',p_ticket_id);
  UPDATE positive_ai_queue SET status='evaluating',job_id=v_job,form_snapshot=p_form_snapshot,evaluation_payload=p_payload,
    lease_until=NULL,updated_at=now(),last_error=NULL WHERE ticket_id=p_ticket_id;
  INSERT INTO ai_evaluation_retry_queue(ticket_id,job_id,payload,next_retry_at)
    VALUES(p_ticket_id,v_job,p_payload,now()+interval '5 minutes')
    ON CONFLICT(ticket_id) DO UPDATE SET job_id=EXCLUDED.job_id,payload=EXCLUDED.payload,next_retry_at=EXCLUDED.next_retry_at,
      retry_count=0,lease_id=NULL,lease_until=NULL,last_error=NULL;
  RETURN v_job;
END $$;

CREATE OR REPLACE FUNCTION public.lock_positive_monitoria_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.active AND NEW.ticket_id IS NOT NULL AND EXISTS(SELECT 1 FROM positive_ai_queue WHERE ticket_id=btrim(NEW.ticket_id)) THEN
    PERFORM pg_advisory_xact_lock(hashtext('positive_ticket_'||btrim(NEW.ticket_id)));
    IF EXISTS(SELECT 1 FROM monitorias WHERE ticket_id=btrim(NEW.ticket_id) AND active) THEN
      RAISE EXCEPTION 'Este ticket positivo já possui monitoria.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

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
    IF v_reason IS NULL AND v_score<75 THEN v_reason:='Nota abaixo de 75% — revisão manual necessária.'; END IF;
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
    evaluator_name,evaluated_name,form_name,team_name,applied_config,concluded_at)
  VALUES(d.form_id,v_auditor.id,v_agent.id,v_agent.primary_team_id,nullif(q.ticket_snapshot->>'ticket_group_team_id','')::uuid,
    q.ticket_id,d.channel,nullif(q.ticket_snapshot->>'ticket_date','')::timestamptz::date,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,'Positiva',coalesce(d.satisfaction_comment,'')<>'',d.satisfaction_comment,
    d.result->'suggested_answers',coalesce(d.result->'suggested_observations','{}'),
    ARRAY(SELECT key FROM jsonb_each(coalesce(d.result->'suggested_critical_errors','{}')) WHERE value='true'::jsonb),
    coalesce((SELECT jsonb_object_agg(c->>'id',d.result#>ARRAY['suggested_observations',c->>'id'])
      FROM jsonb_array_elements(coalesce(q.form_snapshot->'critical_errors','[]'::jsonb)) c),'{}'::jsonb),
    v_score,'concluida','automatic',true,d.result->>'summary',
    q.form_snapshot || jsonb_build_object('ai_evaluation',d.result || jsonb_build_object('score',v_score,'automatic_positive',true,
      'dialogue',coalesce(q.evaluation_payload->'dialogue','[]'::jsonb)),
      'ticket_fields',coalesce(d.result->'ticket_fields','[]'::jsonb),'automation','positive_csat'),
    jsonb_build_array(jsonb_build_object('action','Monitoria avaliada e concluída automaticamente pela IA',
      'by_id',v_auditor.id,'by_name',v_auditor.name,'at',now(),'note','Automação de CSAT positivo. Nota calculada a partir dos critérios: '||v_score||'%. Auditor responsável configurado; não representa avaliação manual.')),
    v_auditor.name,v_agent.name,q.form_snapshot->>'title',v_team,v_config,now()) RETURNING id INTO v_id;
  UPDATE positive_ai_queue SET status='completed',score=v_score,monitoria_id=v_id,last_error=NULL,evaluation_payload=NULL,updated_at=now()
    WHERE ticket_id=q.ticket_id;
END $$;

CREATE OR REPLACE FUNCTION public.claim_positive_ai_work() RETURNS SETOF public.positive_ai_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM positive_ai_config c JOIN users u ON u.id=c.auditor_id
      JOIN auth.users a ON a.id=u.id WHERE c.enabled AND u.active AND u.role IN ('admin','qualidade','gestor_qualidade')) THEN RETURN; END IF;
  -- Manual save replaces the retained item as well as its AI draft.
  UPDATE positive_ai_queue q SET status='completed',monitoria_id=m.id,updated_at=now()
    FROM monitorias m WHERE m.ticket_id=q.ticket_id AND m.active
      AND q.status NOT IN ('completed','skipped');
  -- A cancelled/definitively failed job remains visible for human intervention.
  UPDATE positive_ai_queue q SET status='blocked',last_error=coalesce(j.error_message,'Avaliação interrompida; revisão manual necessária.'),
    next_attempt_at='infinity',updated_at=now()
    FROM ai_evaluation_jobs j WHERE q.job_id=j.job_id AND q.status='evaluating' AND j.status IN ('failed','cancelled');
  SELECT q.ticket_id INTO v_id FROM positive_ai_queue q
    WHERE q.status IN ('pending','preparing','blocked') AND q.next_attempt_at <= now()
      AND (q.lease_until IS NULL OR q.lease_until < now())
    ORDER BY CASE WHEN q.status='pending' THEN 0 ELSE 1 END,q.created_at,q.ticket_id FOR UPDATE SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE positive_ai_queue q SET status='preparing',lease_id=gen_random_uuid(),
    lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now(),
    auditor_id=coalesce(q.auditor_id,(SELECT c.auditor_id FROM positive_ai_config c))
    WHERE q.ticket_id=v_id RETURNING q.*;
END $$;

-- Resume only tickets skipped by the removed cap; never overwrite saved work.
UPDATE public.positive_ai_queue q SET status='pending',attempts=0,next_attempt_at=now(),
  lease_id=NULL,lease_until=NULL,last_error=NULL,updated_at=now()
WHERE status='skipped' AND last_error LIKE 'Limite de duas positivas por agente%'
  AND NOT EXISTS(SELECT 1 FROM public.monitorias m WHERE m.ticket_id=q.ticket_id AND m.active)
  AND NOT EXISTS(SELECT 1 FROM public.ai_evaluation_drafts d WHERE d.ticket_id=q.ticket_id)
  AND NOT EXISTS(SELECT 1 FROM public.ai_evaluation_jobs j WHERE j.ticket_id=q.ticket_id AND j.status='running');

-- Existing preparation failures must not continue the old unbounded loop.
UPDATE public.positive_ai_queue SET next_attempt_at='infinity',updated_at=now()
WHERE status='blocked' AND next_attempt_at <> 'infinity' AND (
  attempts>=5 OR last_error LIKE 'Tipo de cliente%'
  OR last_error LIKE 'Transcrição sem identificação%'
  OR last_error LIKE 'Agente ativo ou equipe%'
  OR last_error LIKE '%revisão manual necessária%');

COMMIT;
