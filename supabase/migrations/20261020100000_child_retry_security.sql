BEGIN;

-- Keep recovered historical jobs eligible for one fresh run. The archived
-- completed job is the reason for requeueing it, not a duplicate evaluation.
CREATE OR REPLACE FUNCTION public.start_child_ai_job(
  p_ticket_id text, p_lease_id uuid, p_payload jsonb, p_form_snapshot jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
    OR EXISTS(SELECT 1 FROM ai_evaluation_jobs WHERE ticket_id=p_ticket_id AND status='completed'
      AND (q.legacy_job_id IS NULL OR job_id IS DISTINCT FROM q.legacy_job_id)) THEN
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
REVOKE ALL ON FUNCTION public.start_child_ai_job(text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_child_ai_job(text,uuid,jsonb,jsonb) TO service_role;

-- CREATE OR REPLACE after renaming the historical writer creates a new
-- function with PostgreSQL's default PUBLIC execute grant unless revoked.
REVOKE ALL ON FUNCTION public.finish_child_ai_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_child_ai_job(uuid) TO service_role;

-- Expired child reviews resolve to a binary verdict and must never acquire a
-- numeric quality score as a side effect of the shared deadline scheduler.
CREATE OR REPLACE FUNCTION public.process_action_deadline_timeouts()
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE item record; quality_turn boolean; child_ticket boolean;
BEGIN
  FOR item IN SELECT m.id,m.status,m.score,m.pj_review_required,m.form_id,m.form_snapshot
    FROM public.monitorias m
    WHERE m.active AND m.action_deadline_at < now()
      AND m.form_snapshot->>'legacy_source' IS DISTINCT FROM 'zendesk_child_note'
      AND m.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada',
        'pendente_revisao','aguardando_gestor_suporte','contestacao_negada')
      AND (NOT m.pj_review_required OR (m.pj_review_required
        AND m.status='pendente_revisao' AND m.form_snapshot->>'automation'='positive_csat'))
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    quality_turn := item.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada');
    child_ticket := item.form_snapshot->>'ticket_kind'='chamado_filho'
      OR item.form_id IN (
        '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid);
    IF item.pj_review_required THEN
      PERFORM set_config('app.positive_ai_timeout',item.id::text,true);
    END IF;
    UPDATE public.monitorias SET status='concluida',
      score=CASE WHEN child_ticket THEN NULL WHEN quality_turn THEN 100 ELSE item.score END,
      resolution_type='automatic',concluded_at=now(),updated_at=now(),
      history=coalesce(history,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'action','Finalização Automática (Prazo)','by_id','system','by_name','Sistema Automático','at',now(),
        'note',CASE WHEN quality_turn THEN 'Monitoria aprovada automaticamente (nota 100%) por perda de prazo da Equipe de Qualidade.'
          ELSE 'Monitoria aprovada automaticamente por perda de prazo da Equipe de Suporte.' END))
      WHERE id=item.id;
    IF item.pj_review_required THEN
      PERFORM set_config('app.positive_ai_timeout','',true);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.process_action_deadline_timeouts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_action_deadline_timeouts() TO service_role;

COMMIT;
