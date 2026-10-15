-- Re-evaluate the October 1-6 child jobs produced before child-ticket
-- monitorias existed. Preserve the original three-check result for audit.
BEGIN;

ALTER TABLE public.child_ai_queue ADD COLUMN legacy_job_id uuid;

CREATE TABLE public.child_ai_legacy_jobs (
  ticket_id text PRIMARY KEY,
  original_job_id uuid NOT NULL,
  original_job jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.child_ai_legacy_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.child_ai_legacy_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.child_ai_legacy_jobs TO authenticated;
GRANT ALL ON public.child_ai_legacy_jobs TO service_role;
CREATE POLICY child_ai_legacy_quality_read ON public.child_ai_legacy_jobs FOR SELECT TO authenticated
  USING (_private.is_quality_team_user());

INSERT INTO public.child_ai_legacy_jobs(ticket_id, original_job_id, original_job)
SELECT j.ticket_id, j.job_id, to_jsonb(j)
FROM public.ai_evaluation_jobs j
WHERE j.evaluation_type = 'chamado_filho' AND j.status = 'completed'
  AND j.finished_at >= '2026-10-01' AND j.finished_at < '2026-10-07'
  AND jsonb_typeof(j.result->'checks') = 'array'
  AND jsonb_array_length(j.result->'checks') = 3
  AND NOT EXISTS (SELECT 1 FROM public.monitorias m WHERE btrim(m.ticket_id) = btrim(j.ticket_id))
  AND NOT EXISTS (SELECT 1 FROM public.ai_evaluation_drafts d WHERE d.ticket_id = j.ticket_id)
  AND NOT EXISTS (SELECT 1 FROM public.child_ai_queue q WHERE q.ticket_id = j.ticket_id)
  AND EXISTS (SELECT 1 FROM public.queue_ticket_catalog c
    WHERE c.ticket_id = j.ticket_id AND c.queue_type = 'filhos'
      AND jsonb_typeof(c.ticket_snapshot) = 'object')
ON CONFLICT (ticket_id) DO NOTHING;

INSERT INTO public.child_ai_queue(ticket_id, ticket_snapshot, auditor_id, legacy_job_id)
SELECT a.ticket_id, c.ticket_snapshot, config.auditor_id, a.original_job_id
FROM public.child_ai_legacy_jobs a
JOIN public.ai_evaluation_jobs j ON j.ticket_id = a.ticket_id AND j.job_id = a.original_job_id
JOIN public.queue_ticket_catalog c ON c.ticket_id = a.ticket_id AND c.queue_type = 'filhos'
JOIN public.child_ai_config config ON config.id = true
WHERE NOT EXISTS (SELECT 1 FROM public.monitorias m WHERE btrim(m.ticket_id) = btrim(a.ticket_id))
  AND NOT EXISTS (SELECT 1 FROM public.ai_evaluation_drafts d WHERE d.ticket_id = a.ticket_id)
ON CONFLICT (ticket_id) DO NOTHING;

-- The ordinary worker rejects completed jobs. Permit only an archived legacy
-- result with the same job ID, then let its existing UPSERT create a new run.
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
    OR (q.legacy_job_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM ai_evaluation_jobs j JOIN child_ai_legacy_jobs a
        ON a.ticket_id=j.ticket_id AND a.original_job_id=j.job_id
      WHERE j.ticket_id=p_ticket_id AND j.job_id=q.legacy_job_id AND j.status='completed'))
    OR EXISTS(SELECT 1 FROM ai_evaluation_jobs j WHERE j.ticket_id=p_ticket_id AND j.status='completed'
      AND NOT (q.legacy_job_id IS NOT NULL AND j.job_id=q.legacy_job_id
        AND EXISTS (SELECT 1 FROM child_ai_legacy_jobs a WHERE a.ticket_id=p_ticket_id
          AND a.original_job_id=j.job_id))) THEN
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
    OR p_form_snapshot->>'id' IS DISTINCT FROM '6c7d1e88-841b-4da9-9a66-9f1464ce896f'
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

COMMIT;
