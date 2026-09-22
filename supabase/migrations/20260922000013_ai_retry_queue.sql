-- Durable retries for the existing server-owned AI job. The OpenRouter key
-- remains exclusively in the Edge Function secret OPENROUTER_API_KEY.
CREATE TABLE public.ai_evaluation_retry_queue (
  ticket_id TEXT PRIMARY KEY,
  job_id UUID NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_id UUID,
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_evaluation_retry_due_idx
  ON public.ai_evaluation_retry_queue(next_retry_at)
  WHERE lease_until IS NULL;
ALTER TABLE public.ai_evaluation_retry_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_evaluation_retry_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_evaluation_retry_queue TO service_role;
GRANT SELECT, UPDATE ON public.ai_evaluation_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.claim_due_ai_evaluation_retries(p_limit INTEGER DEFAULT 1)
RETURNS TABLE(ticket_id TEXT, job_id UUID, payload JSONB, retry_count INTEGER, lease_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Apenas o serviço de IA pode obter retries.'; END IF;
  RETURN QUERY
  WITH due AS (
    SELECT q.ticket_id FROM public.ai_evaluation_retry_queue q
    JOIN public.ai_evaluation_jobs j ON j.ticket_id = q.ticket_id AND j.job_id = q.job_id
    WHERE j.status = 'running' AND q.next_retry_at <= now()
      AND (q.lease_until IS NULL OR q.lease_until < now())
    ORDER BY q.next_retry_at, q.created_at
    LIMIT LEAST(GREATEST(p_limit, 1), 3)
    FOR UPDATE OF q SKIP LOCKED
  )
  UPDATE public.ai_evaluation_retry_queue q
    SET lease_id = gen_random_uuid(), lease_until = now() + interval '5 minutes', updated_at = now()
  FROM due WHERE q.ticket_id = due.ticket_id
  RETURNING q.ticket_id, q.job_id, q.payload, q.retry_count, q.lease_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_due_ai_evaluation_retries(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_ai_evaluation_retries(INTEGER) TO service_role;

-- Vault stores only the Supabase worker-invocation credentials, never the
-- OpenRouter key. Configure ai_retry_project_url and ai_retry_service_key
-- in Vault; without them the cron invocation safely does nothing.
CREATE OR REPLACE FUNCTION _private.invoke_ai_retry_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  IF to_regnamespace('vault') IS NULL OR to_regnamespace('net') IS NULL THEN
    RAISE WARNING 'AI retry worker requires Vault and pg_net.';
    RETURN;
  END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1'
    INTO v_url USING 'ai_retry_project_url';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1'
    INTO v_key USING 'ai_retry_service_key';
  IF nullif(v_url, '') IS NULL OR nullif(v_key, '') IS NULL THEN
    RAISE WARNING 'AI retry worker Vault configuration is missing.';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/helpdesk-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key),
    body := '{"action":"process_ai_retries"}'::JSONB,
    timeout_milliseconds := 140000
  );
END;
$$;
REVOKE ALL ON FUNCTION _private.invoke_ai_retry_worker() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    EXECUTE 'SELECT cron.schedule(''wp-quality-ai-retries'', ''* * * * *'', ''SELECT _private.invoke_ai_retry_worker()'')';
  END IF;
END;
$$;
