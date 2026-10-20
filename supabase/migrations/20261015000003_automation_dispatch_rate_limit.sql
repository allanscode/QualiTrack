-- Dispatch at most one automatic ticket evaluation per rolling minute across
-- positive CSAT and child tickets. The gate runs before invoking an Edge Function.
BEGIN;

CREATE TABLE _private.auto_monitoria_dispatch (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  next_allowed_at timestamptz NOT NULL DEFAULT '-infinity',
  last_dispatched_at timestamptz,
  last_kind text CHECK (last_kind IN ('positive','child'))
);
INSERT INTO _private.auto_monitoria_dispatch(id) VALUES (true);
ALTER TABLE _private.auto_monitoria_dispatch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON _private.auto_monitoria_dispatch FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION _private.claim_auto_monitoria_dispatch(p_kind text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_now timestamptz := clock_timestamp(); v_claimed boolean;
BEGIN
  IF p_kind NOT IN ('positive','child') THEN
    RAISE EXCEPTION 'Tipo de automação inválido.';
  END IF;
  UPDATE _private.auto_monitoria_dispatch
    SET next_allowed_at = v_now + interval '1 minute',
        last_dispatched_at = v_now, last_kind = p_kind
    WHERE id = true AND next_allowed_at <= v_now
    RETURNING true INTO v_claimed;
  RETURN coalesce(v_claimed,false);
END $$;
REVOKE ALL ON FUNCTION _private.claim_auto_monitoria_dispatch(text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION _private.invoke_positive_ai_worker() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_url text; v_key text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.positive_ai_config WHERE enabled) THEN RETURN; END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='net') THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='positive_ai_project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='positive_ai_service_key' LIMIT 1;
  IF nullif(v_url,'') IS NULL OR nullif(v_key,'') IS NULL THEN RETURN; END IF;
  IF NOT _private.claim_auto_monitoria_dispatch('positive') THEN RETURN; END IF;
  PERFORM net.http_post(url:=v_url||'/functions/v1/helpdesk-queue',headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
    body:='{"action":"process_positive_ai"}'::jsonb,timeout_milliseconds:=140000);
END $$;
REVOKE ALL ON FUNCTION _private.invoke_positive_ai_worker() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION _private.invoke_child_ai_worker() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_url text; v_key text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.child_ai_config WHERE enabled) THEN RETURN; END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='net') THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='positive_ai_project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='positive_ai_service_key' LIMIT 1;
  IF nullif(v_url,'') IS NULL OR nullif(v_key,'') IS NULL THEN RETURN; END IF;
  IF NOT _private.claim_auto_monitoria_dispatch('child') THEN RETURN; END IF;
  PERFORM net.http_post(url:=v_url||'/functions/v1/helpdesk-queue',headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
    body:='{"action":"process_child_ai"}'::jsonb,timeout_milliseconds:=140000);
END $$;
REVOKE ALL ON FUNCTION _private.invoke_child_ai_worker() FROM PUBLIC,anon,authenticated;

-- Alternate the two queues so both receive capacity when both are enabled.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    PERFORM cron.schedule('qwp-positive-ai','*/2 * * * *','SELECT _private.invoke_positive_ai_worker();');
    PERFORM cron.schedule('qwp-child-ai','1-59/2 * * * *','SELECT _private.invoke_child_ai_worker();');
  END IF;
END $$;

COMMIT;
