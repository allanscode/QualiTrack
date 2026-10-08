BEGIN;

ALTER TABLE public.positive_auto_publications
  ADD COLUMN source text NOT NULL DEFAULT 'positive_csat'
  CHECK (source IN ('positive_csat', 'final_decision'));

-- Initial human audits still use the preview flow. A positive decision made
-- after a review or contestation is final and must be sent durably.
CREATE FUNCTION public.capture_final_positive_decision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'concluida'
    AND NEW.status='concluida' AND NEW.active IS TRUE
    AND NEW.satisfaction_result='Positiva' AND NEW.score>=75 AND NEW.score<=100
    AND btrim(NEW.ticket_id) ~ '^[0-9]+$'
    AND NEW.form_id IS DISTINCT FROM '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
    AND coalesce(NEW.form_snapshot->>'ticket_kind','')<>'chamado_filho'
    AND coalesce(NEW.form_snapshot->>'automation','')<>'positive_csat' THEN
    INSERT INTO public.positive_auto_publications(monitoria_id,ticket_id,source)
      VALUES(NEW.id,btrim(NEW.ticket_id),'final_decision')
      ON CONFLICT(monitoria_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_final_positive_decision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_final_positive_decision
  AFTER UPDATE OF status ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION public.capture_final_positive_decision();

-- Ticket 180210 was reevaluated and concluded before this trigger existed.
-- Only enqueue it if the final decision is still active and no positive
-- Zendesk receipt exists. No other historical monitorias are backfilled.
INSERT INTO public.positive_auto_publications(monitoria_id,ticket_id,source)
  SELECT m.id,btrim(m.ticket_id),'final_decision'
  FROM public.monitorias m
  WHERE btrim(m.ticket_id)='180210' AND m.active IS TRUE
    AND m.status='concluida' AND m.satisfaction_result='Positiva'
    AND m.score>=75 AND m.score<=100
    AND m.form_id IS DISTINCT FROM '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(m.history,'[]'::jsonb)) h
      WHERE h->>'action' LIKE 'Monitoria Reavaliada%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.helpdesk_submissions s
      WHERE s.monitoria_id=m.id AND s.status='sent' AND s.outcome='positiva'
    )
  ON CONFLICT(monitoria_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_positive_auto_publication()
RETURNS SETOF public.positive_auto_publications
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Worker não autorizado.' USING ERRCODE='42501';
  END IF;
  UPDATE public.positive_auto_publications q
    SET status='sent',lease_id=NULL,lease_until=NULL,updated_at=now()
    WHERE q.status IN ('pending','processing') AND EXISTS (
      SELECT 1 FROM public.helpdesk_submissions s
      WHERE s.monitoria_id=q.monitoria_id AND s.status='sent' AND s.outcome='positiva'
    );
  UPDATE public.positive_auto_publications q
    SET status='uncertain',lease_id=NULL,lease_until=NULL,
      last_error='Envio iniciado anteriormente; confira o ticket no Zendesk antes de reenviar.',updated_at=now()
    WHERE q.status='processing' AND q.lease_until<now()
      AND EXISTS(SELECT 1 FROM public.helpdesk_publish_claims c WHERE c.monitoria_id=q.monitoria_id);
  UPDATE public.positive_auto_publications q
    SET status='pending',lease_id=NULL,lease_until=NULL,updated_at=now()
    WHERE q.status='processing' AND q.lease_until<now()
      AND NOT EXISTS(SELECT 1 FROM public.helpdesk_publish_claims c WHERE c.monitoria_id=q.monitoria_id);
  UPDATE public.positive_auto_publications q
    SET status='skipped',lease_id=NULL,lease_until=NULL,
      last_error='A monitoria deixou de ser uma decisão positiva final válida.',updated_at=now()
    WHERE q.status='pending' AND NOT EXISTS (
      SELECT 1 FROM public.monitorias m
      WHERE m.id=q.monitoria_id AND m.active IS TRUE AND m.status='concluida'
        AND m.score>=75 AND m.score<=100 AND btrim(m.ticket_id)=q.ticket_id
        AND ((q.source='positive_csat' AND m.form_snapshot->>'automation'='positive_csat')
          OR (q.source='final_decision' AND m.satisfaction_result='Positiva'
            AND coalesce(m.form_snapshot->>'automation','')<>'positive_csat'))
    );
  SELECT q.monitoria_id INTO v_id FROM public.positive_auto_publications q
    WHERE q.status='pending' AND q.next_attempt_at<=now()
    ORDER BY q.created_at,q.monitoria_id FOR UPDATE SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE public.positive_auto_publications q
    SET status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes',
      attempts=q.attempts+1,updated_at=now()
    WHERE q.monitoria_id=v_id RETURNING q.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_positive_auto_publication() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_positive_auto_publication() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
