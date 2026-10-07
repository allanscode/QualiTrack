-- Future final decisions only. The staging switch remains off until external
-- Zendesk field updates are explicitly enabled; no historical backfill runs.
BEGIN;
CREATE TABLE public.final_positive_invalidation_config (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE public.final_positive_invalidation_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.final_positive_invalidation_config FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.final_positive_invalidation_config TO service_role;

CREATE TABLE public.final_positive_invalidation_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoria_id uuid NOT NULL UNIQUE REFERENCES public.monitorias(id) ON DELETE CASCADE,
  ticket_id text NOT NULL CHECK(ticket_id ~ '^[0-9]+$'),
  decision_at timestamptz NOT NULL DEFAULT now(),
  decision_score numeric(5,2) NOT NULL CHECK(decision_score>=0 AND decision_score<75),
  generation integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','applied','blocked','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  applied_at timestamptz,
  zendesk_updated_at text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX final_positive_invalidation_due_idx ON public.final_positive_invalidation_outbox(next_attempt_at)
  WHERE status IN ('pending','processing');
ALTER TABLE public.final_positive_invalidation_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.final_positive_invalidation_outbox FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.final_positive_invalidation_outbox TO authenticated;
GRANT ALL ON public.final_positive_invalidation_outbox TO service_role;
CREATE POLICY final_positive_invalidation_quality_read ON public.final_positive_invalidation_outbox
  FOR SELECT TO authenticated USING (_private.is_quality_team_user());

CREATE FUNCTION public.capture_final_positive_invalidation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='concluida' AND OLD.status IS DISTINCT FROM 'concluida'
    AND NEW.active AND NEW.satisfaction_result='Positiva' AND NEW.score>=0 AND NEW.score<75
    AND btrim(NEW.ticket_id) ~ '^[0-9]+$'
    AND NEW.form_id IS DISTINCT FROM '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
    AND coalesce(NEW.form_snapshot->>'ticket_kind','')<>'chamado_filho' THEN
    INSERT INTO final_positive_invalidation_outbox(monitoria_id,ticket_id,decision_score)
      VALUES(NEW.id,btrim(NEW.ticket_id),NEW.score)
      ON CONFLICT(monitoria_id) DO UPDATE SET ticket_id=EXCLUDED.ticket_id,decision_score=EXCLUDED.decision_score,
        decision_at=now(),generation=final_positive_invalidation_outbox.generation+1,status='pending',attempts=0,
        next_attempt_at=now(),lease_id=NULL,lease_until=NULL,applied_at=NULL,zendesk_updated_at=NULL,last_error=NULL,updated_at=now();
  ELSIF NEW.status IS DISTINCT FROM 'concluida' OR NEW.active IS DISTINCT FROM true
    OR NEW.satisfaction_result IS DISTINCT FROM 'Positiva' OR NEW.score IS NULL OR NEW.score<0 OR NEW.score>=75 THEN
    UPDATE final_positive_invalidation_outbox SET status='skipped',lease_id=NULL,lease_until=NULL,
      last_error='Monitoria reaberta, desativada ou decisão alterada; invalidação não autorizada.',updated_at=now()
      WHERE monitoria_id=NEW.id AND status IN ('pending','processing','blocked');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_final_positive_invalidation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_final_positive_invalidation
  AFTER UPDATE OF status,active,score,satisfaction_result,ticket_id,form_id,form_snapshot ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION public.capture_final_positive_invalidation();

CREATE FUNCTION public.final_positive_invalidation_is_current(p_monitoria_id uuid,p_ticket_id text,p_score numeric)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM monitorias m WHERE m.id=p_monitoria_id AND btrim(m.ticket_id)=p_ticket_id
      AND m.active AND m.satisfaction_result='Positiva' AND m.status='concluida'
      AND m.score=p_score AND m.score>=0 AND m.score<75
      AND m.form_id IS DISTINCT FROM '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
      AND coalesce(m.form_snapshot->>'ticket_kind','')<>'chamado_filho'
      AND NOT EXISTS (SELECT 1 FROM monitorias newer WHERE btrim(newer.ticket_id)=p_ticket_id AND newer.active
        AND (coalesce(newer.created_at,'-infinity'::timestamptz),newer.id)>(coalesce(m.created_at,'-infinity'::timestamptz),m.id))
  );
$$;
REVOKE ALL ON FUNCTION public.final_positive_invalidation_is_current(uuid,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.final_positive_invalidation_is_current(uuid,text,numeric) TO service_role;

CREATE FUNCTION public.claim_final_positive_invalidation()
RETURNS SETOF public.final_positive_invalidation_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM final_positive_invalidation_config WHERE enabled) THEN RETURN; END IF;
  UPDATE final_positive_invalidation_outbox q SET status='skipped',lease_id=NULL,lease_until=NULL,
    last_error='A monitoria não é mais a decisão final vigente deste ticket.',updated_at=now()
    WHERE q.status IN ('pending','processing')
      AND NOT final_positive_invalidation_is_current(q.monitoria_id,q.ticket_id,q.decision_score);
  SELECT id INTO v_id FROM final_positive_invalidation_outbox
    WHERE status IN ('pending','processing') AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now())
    ORDER BY decision_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE final_positive_invalidation_outbox q SET status='processing',attempts=attempts+1,
    lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now() WHERE q.id=v_id RETURNING q.*;
END $$;

CREATE FUNCTION public.authorize_final_positive_invalidation(p_id uuid,p_lease_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q final_positive_invalidation_outbox%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.'; END IF;
  SELECT * INTO q FROM final_positive_invalidation_outbox WHERE id=p_id FOR UPDATE;
  RETURN q.id IS NOT NULL AND q.status='processing' AND q.lease_id=p_lease_id AND q.lease_until>now()
    AND EXISTS(SELECT 1 FROM final_positive_invalidation_config WHERE enabled)
    AND final_positive_invalidation_is_current(q.monitoria_id,q.ticket_id,q.decision_score);
END $$;

CREATE FUNCTION public.finish_final_positive_invalidation(p_id uuid,p_lease_id uuid,p_status text,p_error text DEFAULT NULL,p_zendesk_updated_at text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q final_positive_invalidation_outbox%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.'; END IF;
  IF p_status NOT IN ('applied','pending','blocked','skipped') THEN RAISE EXCEPTION 'Estado inválido.'; END IF;
  SELECT * INTO q FROM final_positive_invalidation_outbox WHERE id=p_id FOR UPDATE;
  IF q.id IS NULL OR q.status<>'processing' OR q.lease_id IS DISTINCT FROM p_lease_id THEN RETURN false; END IF;
  IF p_status='applied' AND NOT final_positive_invalidation_is_current(q.monitoria_id,q.ticket_id,q.decision_score) THEN
    p_status:='blocked'; p_error:='Decisão alterada durante a sincronização. Confira os campos no Zendesk antes de qualquer nova tentativa.';
  ELSIF p_status='pending' AND q.attempts>=8 THEN
    p_status:='blocked';p_error:='Limite de tentativas atingido. '||coalesce(p_error,'Confira a integração Zendesk.');
  END IF;
  UPDATE final_positive_invalidation_outbox SET status=p_status,last_error=left(p_error,1000),
    applied_at=CASE WHEN p_status='applied' THEN now() ELSE applied_at END,
    zendesk_updated_at=coalesce(p_zendesk_updated_at,zendesk_updated_at),lease_id=NULL,lease_until=NULL,
    next_attempt_at=CASE WHEN p_status='pending' THEN now()+make_interval(secs=>least(3600,(60*power(2,least(q.attempts-1,6)))::integer)) ELSE next_attempt_at END,
    updated_at=now() WHERE id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_final_positive_invalidation(),public.authorize_final_positive_invalidation(uuid,uuid),
  public.finish_final_positive_invalidation(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_final_positive_invalidation(),public.authorize_final_positive_invalidation(uuid,uuid),
  public.finish_final_positive_invalidation(uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION _private.invoke_final_positive_invalidation_worker() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_url text;v_key text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.final_positive_invalidation_config WHERE enabled) THEN RETURN; END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='net') THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='positive_ai_project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='positive_ai_service_key' LIMIT 1;
  IF nullif(v_url,'') IS NULL OR nullif(v_key,'') IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url:=v_url||'/functions/v1/helpdesk-queue',headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
    body:='{"action":"process_final_positive_invalidation"}'::jsonb,timeout_milliseconds:=60000);
END $$;
REVOKE ALL ON FUNCTION _private.invoke_final_positive_invalidation_worker() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    PERFORM cron.schedule('qwp-final-positive-invalidation','* * * * *','SELECT _private.invoke_final_positive_invalidation_worker();');
  END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
