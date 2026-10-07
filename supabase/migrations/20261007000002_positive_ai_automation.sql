-- Durable positive-CSAT intake. Disabled until an administrator provisions the worker.
BEGIN;
CREATE TABLE public.positive_ai_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  auditor_id uuid REFERENCES public.users(id),
  max_evaluations integer CHECK (max_evaluations > 0),
  executions_started integer NOT NULL DEFAULT 0 CHECK (executions_started >= 0),
  capture_cursor text,
  capture_lease_id uuid,
  capture_lease_until timestamptz,
  last_capture_at timestamptz,
  last_error text
);
ALTER TABLE public.positive_ai_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.positive_ai_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.positive_ai_config TO service_role;

CREATE TABLE public.positive_ai_queue (
  ticket_id text PRIMARY KEY CHECK (ticket_id ~ '^[0-9]+$'),
  ticket_snapshot jsonb NOT NULL CHECK (jsonb_typeof(ticket_snapshot) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','preparing','evaluating','review_required','completed','blocked','skipped')),
  auditor_id uuid REFERENCES public.users(id),
  job_id uuid,
  form_snapshot jsonb,
  evaluation_payload jsonb,
  score numeric(5,2),
  monitoria_id uuid REFERENCES public.monitorias(id) ON DELETE SET NULL,
  lease_id uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX positive_ai_due_idx ON public.positive_ai_queue(next_attempt_at,created_at)
  WHERE status IN ('pending','preparing','blocked');
CREATE UNIQUE INDEX positive_ai_job_idx ON public.positive_ai_queue(job_id) WHERE job_id IS NOT NULL;
ALTER TABLE public.positive_ai_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.positive_ai_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.positive_ai_queue TO authenticated;
GRANT ALL ON public.positive_ai_queue TO service_role;
CREATE POLICY positive_ai_quality_read ON public.positive_ai_queue FOR SELECT TO authenticated
  USING (_private.is_quality_team_user());

-- Capture also when an operator loads a page: subsequent view membership/status
-- changes never delete the original snapshot or restart a completed evaluation.
CREATE FUNCTION public.capture_positive_ai_ticket() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.queue_type = 'positivas' AND NEW.ticket_snapshot IS NOT NULL
    AND EXISTS (SELECT 1 FROM positive_ai_config WHERE enabled) THEN
    INSERT INTO positive_ai_queue(ticket_id,ticket_snapshot,auditor_id)
      SELECT NEW.ticket_id,NEW.ticket_snapshot,c.auditor_id FROM positive_ai_config c
      ON CONFLICT(ticket_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_positive_ai_ticket() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_positive_ai_ticket AFTER INSERT OR UPDATE ON public.queue_ticket_catalog
  FOR EACH ROW EXECUTE FUNCTION public.capture_positive_ai_ticket();

CREATE FUNCTION public.claim_positive_ai_scan() RETURNS SETOF public.positive_ai_config
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.'; END IF;
  RETURN QUERY UPDATE positive_ai_config c SET capture_lease_id=gen_random_uuid(),capture_lease_until=now()+interval '2 minutes'
    WHERE c.enabled AND (c.capture_lease_until IS NULL OR c.capture_lease_until < now())
      AND EXISTS (SELECT 1 FROM users u JOIN auth.users a ON a.id=u.id
        WHERE u.id=c.auditor_id AND u.active AND u.role IN ('admin','qualidade','gestor_qualidade')) RETURNING c.*;
END $$;

CREATE FUNCTION public.claim_positive_ai_work() RETURNS SETOF public.positive_ai_queue
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
    ORDER BY q.created_at,q.ticket_id FOR UPDATE SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE positive_ai_queue q SET status='preparing',lease_id=gen_random_uuid(),
    lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now(),
    auditor_id=coalesce(q.auditor_id,(SELECT c.auditor_id FROM positive_ai_config c))
    WHERE q.ticket_id=v_id RETURNING q.*;
END $$;

-- Reserve the standard AI job atomically with its frozen form/context. The same
-- retry queue used by manual evaluations recovers an interrupted worker.
CREATE FUNCTION public.start_positive_ai_job(p_ticket_id text,p_lease_id uuid,p_payload jsonb,p_form_snapshot jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q positive_ai_queue%ROWTYPE; v_job uuid; v_agent uuid; v_count integer;
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
  SELECT count(*) INTO v_count FROM monitorias WHERE evaluated_id=v_agent AND active AND satisfaction_result='Positiva'
    AND created_at >= (date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo');
  IF v_count>=2 THEN
    UPDATE positive_ai_queue SET status='skipped',last_error='Limite de duas positivas por agente no mês atingido.',lease_until=NULL,updated_at=now() WHERE ticket_id=p_ticket_id;
    RETURN NULL;
  END IF;
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

-- Lock inserts from the UI too, so an automatic completion cannot race a human
-- save for the same ticket/agent. Existing historical rows are untouched.
CREATE FUNCTION public.lock_positive_monitoria_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.active AND NEW.ticket_id IS NOT NULL AND EXISTS(SELECT 1 FROM positive_ai_queue WHERE ticket_id=btrim(NEW.ticket_id)) THEN
    PERFORM pg_advisory_xact_lock(hashtext('positive_ticket_'||btrim(NEW.ticket_id)));
    IF EXISTS(SELECT 1 FROM monitorias WHERE ticket_id=btrim(NEW.ticket_id) AND active) THEN
      RAISE EXCEPTION 'Este ticket positivo já possui monitoria.';
    END IF;
  END IF;
  IF NEW.active AND NEW.satisfaction_result='Positiva' AND NEW.evaluated_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('positive_agent_'||NEW.evaluated_id::text));
    IF EXISTS(SELECT 1 FROM positive_ai_queue WHERE ticket_id=btrim(NEW.ticket_id))
      AND (SELECT count(*) FROM monitorias WHERE evaluated_id=NEW.evaluated_id AND active AND satisfaction_result='Positiva'
        AND created_at >= (date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))>=2 THEN
      RAISE EXCEPTION 'Limite de duas positivas por agente no mês atingido.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aaa_positive_monitoria_lock BEFORE INSERT ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION public.lock_positive_monitoria_insert();
REVOKE ALL ON FUNCTION public.lock_positive_monitoria_insert() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.finish_positive_ai_job(p_job_id uuid) RETURNS void
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
    IF v_reason IS NULL AND v_score<75 THEN v_reason:='Nota abaixo de 75% — revisão manual necessária.'; END IF;
  END IF;
  IF v_reason IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('positive_agent_'||v_agent.id::text));
    IF (SELECT count(*) FROM monitorias WHERE evaluated_id=v_agent.id AND active AND satisfaction_result='Positiva'
      AND created_at >= (date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))>=2 THEN
      v_reason:='Limite de duas positivas por agente no mês atingido; parecer preservado.';
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

CREATE FUNCTION public.on_positive_ai_completed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN PERFORM finish_positive_ai_job(NEW.job_id); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_positive_ai_completed AFTER UPDATE OF status ON public.ai_evaluation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.on_positive_ai_completed();
REVOKE ALL ON FUNCTION public.on_positive_ai_completed() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.claim_positive_ai_scan(),public.claim_positive_ai_work(),
  public.start_positive_ai_job(text,uuid,jsonb,jsonb),public.finish_positive_ai_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_positive_ai_scan(),public.claim_positive_ai_work(),
  public.start_positive_ai_job(text,uuid,jsonb,jsonb),public.finish_positive_ai_job(uuid) TO service_role;

CREATE FUNCTION _private.invoke_positive_ai_worker() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_url text; v_key text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.positive_ai_config WHERE enabled) THEN RETURN; END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='net') THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='positive_ai_project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='positive_ai_service_key' LIMIT 1;
  IF nullif(v_url,'') IS NULL OR nullif(v_key,'') IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url:=v_url||'/functions/v1/helpdesk-queue',headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
    body:='{"action":"process_positive_ai"}'::jsonb,timeout_milliseconds:=140000);
END $$;
REVOKE ALL ON FUNCTION _private.invoke_positive_ai_worker() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    PERFORM cron.schedule('qwp-positive-ai','* * * * *','SELECT _private.invoke_positive_ai_worker();');
  END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
