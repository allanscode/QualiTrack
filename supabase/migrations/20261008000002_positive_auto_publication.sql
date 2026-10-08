BEGIN;

CREATE TABLE public.positive_auto_publications (
  monitoria_id uuid PRIMARY KEY REFERENCES public.monitorias(id) ON DELETE CASCADE,
  ticket_id text NOT NULL CHECK (ticket_id ~ '^[0-9]+$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','skipped','uncertain')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX positive_auto_publications_due_idx ON public.positive_auto_publications(next_attempt_at,created_at)
  WHERE status = 'pending';
ALTER TABLE public.positive_auto_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.positive_auto_publications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.positive_auto_publications TO service_role;

CREATE FUNCTION public.capture_positive_auto_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.active AND NEW.status = 'concluida' AND NEW.score >= 75
    AND NEW.ticket_id ~ '^[0-9]+$'
    AND NEW.form_snapshot->>'automation' = 'positive_csat' THEN
    INSERT INTO public.positive_auto_publications(monitoria_id,ticket_id)
      VALUES(NEW.id,NEW.ticket_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_positive_auto_publication() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER capture_positive_auto_publication AFTER INSERT ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION public.capture_positive_auto_publication();

-- Existing automatically concluded audits are eligible; old AI drafts are not
-- converted because their evidence has not passed the current validation.
INSERT INTO public.positive_auto_publications(monitoria_id,ticket_id)
  SELECT m.id,m.ticket_id FROM public.monitorias m
  WHERE m.active AND m.status='concluida' AND m.score>=75
    AND m.ticket_id ~ '^[0-9]+$' AND m.form_snapshot->>'automation'='positive_csat'
  ON CONFLICT DO NOTHING;

CREATE FUNCTION public.claim_positive_auto_publication()
RETURNS SETOF public.positive_auto_publications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.' USING ERRCODE='42501'; END IF;
  UPDATE public.positive_auto_publications q SET status='sent',lease_id=NULL,lease_until=NULL,updated_at=now()
    WHERE q.status IN ('pending','processing') AND EXISTS(
      SELECT 1 FROM public.helpdesk_submissions s WHERE s.monitoria_id=q.monitoria_id AND s.status='sent');
  UPDATE public.positive_auto_publications q SET status='uncertain',lease_id=NULL,lease_until=NULL,
      last_error='Envio iniciado anteriormente; confira o ticket no Zendesk antes de reenviar.',updated_at=now()
    WHERE q.status='processing' AND q.lease_until<now()
      AND EXISTS(SELECT 1 FROM public.helpdesk_publish_claims c WHERE c.monitoria_id=q.monitoria_id);
  UPDATE public.positive_auto_publications q SET status='pending',lease_id=NULL,lease_until=NULL,updated_at=now()
    WHERE q.status='processing' AND q.lease_until<now()
      AND NOT EXISTS(SELECT 1 FROM public.helpdesk_publish_claims c WHERE c.monitoria_id=q.monitoria_id);
  UPDATE public.positive_auto_publications q SET status='skipped',lease_id=NULL,lease_until=NULL,
      last_error='A monitoria deixou de ser uma positiva concluída válida.',updated_at=now()
    WHERE q.status='pending' AND NOT EXISTS(
      SELECT 1 FROM public.monitorias m WHERE m.id=q.monitoria_id AND m.active
        AND m.status='concluida' AND m.score>=75 AND m.ticket_id=q.ticket_id
        AND m.form_snapshot->>'automation'='positive_csat');
  SELECT q.monitoria_id INTO v_id FROM public.positive_auto_publications q
    WHERE q.status='pending' AND q.next_attempt_at<=now()
    ORDER BY q.created_at,q.monitoria_id FOR UPDATE SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE public.positive_auto_publications q
    SET status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes',
      attempts=q.attempts+1,updated_at=now()
    WHERE q.monitoria_id=v_id RETURNING q.*;
END $$;

CREATE FUNCTION public.finish_positive_auto_publication(
  p_monitoria_id uuid,p_lease_id uuid,p_status text,p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE q public.positive_auto_publications%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('sent','retry','skipped','uncertain') THEN RAISE EXCEPTION 'Estado de publicação inválido.'; END IF;
  SELECT * INTO q FROM public.positive_auto_publications
    WHERE monitoria_id=p_monitoria_id AND lease_id=p_lease_id FOR UPDATE;
  IF q.monitoria_id IS NULL OR q.status<>'processing' THEN RAISE EXCEPTION 'Reserva de publicação inválida.'; END IF;
  UPDATE public.positive_auto_publications SET
    status=CASE WHEN p_status='retry' AND q.attempts<8 THEN 'pending'
      WHEN p_status='retry' THEN 'uncertain' ELSE p_status END,
    next_attempt_at=CASE WHEN p_status='retry' THEN now()+make_interval(secs=>least(3600,60*power(2,q.attempts)::integer))
      ELSE next_attempt_at END,
    lease_id=NULL,lease_until=NULL,last_error=left(p_error,1000),updated_at=now()
    WHERE monitoria_id=p_monitoria_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_positive_auto_publication(),
  public.finish_positive_auto_publication(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_positive_auto_publication(),
  public.finish_positive_auto_publication(uuid,uuid,text,text) TO service_role;

CREATE FUNCTION _private.invoke_positive_auto_publication_worker() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_url text; v_key text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='net') THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='positive_ai_project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='positive_ai_service_key' LIMIT 1;
  IF nullif(v_url,'') IS NULL OR nullif(v_key,'') IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url:=v_url||'/functions/v1/helpdesk-publish-evaluation',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
    body:='{"action":"process_positive_auto_publication"}'::jsonb,timeout_milliseconds:=90000);
END $$;
REVOKE ALL ON FUNCTION _private.invoke_positive_auto_publication_worker() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    PERFORM cron.schedule('qwp-positive-auto-publication','* * * * *',
      'SELECT _private.invoke_positive_auto_publication_worker();');
  END IF;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
