BEGIN;

-- Compare a new final verdict with the latest confirmed Zendesk submission.
-- Older receipts must not suppress a later reversal back to the same outcome.
CREATE OR REPLACE FUNCTION public.enqueue_final_verdict_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_latest_outcome text;
  v_current_outcome text;
BEGIN
  v_current_outcome := CASE WHEN NEW.score >= 75 THEN 'positiva' ELSE 'negativa' END;
  SELECT s.outcome INTO v_latest_outcome
  FROM public.helpdesk_submissions s
  WHERE s.monitoria_id=NEW.id AND s.status='sent'
  ORDER BY s.created_at DESC,s.id DESC
  LIMIT 1;

  IF NEW.active IS TRUE AND NEW.status IN ('concluida','finalizada_alterada')
    AND NEW.score BETWEEN 0 AND 100 AND btrim(NEW.ticket_id) ~ '^[0-9]+$'
    AND NEW.form_id IS DISTINCT FROM '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
    AND coalesce(NEW.form_snapshot->>'legacy_source','') <> 'zendesk_child_note'
    AND v_latest_outcome IS DISTINCT FROM v_current_outcome
  THEN
    INSERT INTO public.positive_auto_publications(monitoria_id,ticket_id,source)
      VALUES(NEW.id,btrim(NEW.ticket_id),'final_verdict')
      ON CONFLICT(monitoria_id) DO UPDATE SET
        ticket_id=EXCLUDED.ticket_id, source='final_verdict', status='pending',
        attempts=0, next_attempt_at=now(), lease_id=NULL, lease_until=NULL,
        last_error=NULL, updated_at=now()
      WHERE public.positive_auto_publications.status IN ('sent','skipped');
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_final_verdict_publication() FROM PUBLIC,anon,authenticated;
COMMIT;
