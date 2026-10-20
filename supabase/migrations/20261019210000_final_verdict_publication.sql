BEGIN;

-- The old queue only captured automatic positive CSAT and selected positive
-- reevaluations. Reuse its lease and cron for every terminal non-child verdict.
ALTER TABLE public.positive_auto_publications DROP CONSTRAINT IF EXISTS positive_auto_publications_source_check;
ALTER TABLE public.positive_auto_publications ADD CONSTRAINT positive_auto_publications_source_check
  CHECK (source IN ('positive_csat','final_decision','final_verdict'));

CREATE OR REPLACE FUNCTION public.enqueue_final_verdict_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.active IS TRUE AND NEW.status IN ('concluida','finalizada_alterada')
    AND NEW.score BETWEEN 0 AND 100 AND btrim(NEW.ticket_id) ~ '^[0-9]+$'
    AND NEW.form_id IS DISTINCT FROM '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
    AND coalesce(NEW.form_snapshot->>'legacy_source','') <> 'zendesk_child_note'
    AND NOT EXISTS (
      SELECT 1 FROM public.helpdesk_submissions s WHERE s.monitoria_id=NEW.id
        AND s.status='sent' AND s.outcome=CASE WHEN NEW.score >= 75 THEN 'positiva' ELSE 'negativa' END
    ) THEN
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
DROP TRIGGER IF EXISTS enqueue_final_verdict_publication ON public.monitorias;
CREATE TRIGGER enqueue_final_verdict_publication
  AFTER INSERT OR UPDATE OF status,score,active ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_final_verdict_publication();

CREATE OR REPLACE FUNCTION public.sync_positive_auto_publication_from_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.status = 'sent' THEN
    UPDATE public.positive_auto_publications
      SET status='sent', lease_id=NULL, lease_until=NULL, last_error=NULL, updated_at=now()
      WHERE monitoria_id=NEW.monitoria_id AND status='pending';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_positive_auto_publication_from_submission() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sync_positive_auto_publication_from_submission ON public.helpdesk_submissions;
CREATE TRIGGER sync_positive_auto_publication_from_submission
  AFTER INSERT OR UPDATE OF status ON public.helpdesk_submissions
  FOR EACH ROW EXECUTE FUNCTION public.sync_positive_auto_publication_from_submission();

CREATE OR REPLACE FUNCTION public.capture_child_auto_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.active IS TRUE
    AND NEW.status IN ('concluida','finalizada_alterada')
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.score IS DISTINCT FROM NEW.score OR OLD.active IS DISTINCT FROM NEW.active)
    AND btrim(NEW.ticket_id) ~ '^[0-9]+$'
    AND NEW.form_id = '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
    AND coalesce(NEW.form_snapshot->>'legacy_source', '') <> 'zendesk_child_note'
    AND NEW.score >= 0 AND NEW.score <= 100
    AND nullif(btrim(coalesce(NEW.evaluator_note, '')), '') IS NOT NULL
    AND (
      coalesce(NEW.form_snapshot->>'automation', '') <> 'child_ticket'
      OR NEW.form_snapshot#>>'{child_ai_evaluation,status}' = 'conforme'
      OR TG_OP = 'UPDATE'
    ) THEN
    INSERT INTO public.child_auto_publications(monitoria_id, ticket_id)
      VALUES(NEW.id, btrim(NEW.ticket_id))
      ON CONFLICT(monitoria_id) DO UPDATE SET
        ticket_id = EXCLUDED.ticket_id,
        status = 'pending',
        attempts = 0,
        next_attempt_at = now(),
        lease_id = NULL,
        lease_until = NULL,
        last_error = NULL,
        updated_at = now()
      WHERE public.child_auto_publications.status = 'skipped';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_child_auto_publication() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS capture_child_auto_publication ON public.monitorias;
CREATE TRIGGER capture_child_auto_publication
  AFTER INSERT OR UPDATE OF status,score,active ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION public.capture_child_auto_publication();

CREATE OR REPLACE FUNCTION public.claim_child_auto_publication() RETURNS SETOF public.child_auto_publications
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.' USING ERRCODE='42501'; END IF;
  UPDATE public.child_auto_publications q SET status='uncertain',lease_id=NULL,lease_until=NULL,
      last_error='Envio interrompido; confira os comentários e campos do Zendesk antes de reenviar.',updated_at=now()
    WHERE q.status='processing' AND q.lease_until<now();
  UPDATE public.child_auto_publications q SET status='skipped',lease_id=NULL,lease_until=NULL,
      last_error='A monitoria deixou de ser um chamado filho concluído elegível para publicação.',updated_at=now()
    WHERE q.status='pending' AND NOT EXISTS(
      SELECT 1 FROM public.monitorias m WHERE m.id=q.monitoria_id AND m.active IS TRUE
        AND m.status IN ('concluida','finalizada_alterada') AND btrim(m.ticket_id)=q.ticket_id
        AND m.form_id='6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
        AND coalesce(m.form_snapshot->>'legacy_source', '') <> 'zendesk_child_note'
        AND m.score >= 0 AND m.score <= 100
        AND nullif(btrim(coalesce(m.evaluator_note, '')), '') IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM public.monitorias newer WHERE newer.ticket_id=m.ticket_id
          AND newer.active IS TRUE AND (newer.created_at,newer.id)>(m.created_at,m.id)));
  SELECT q.monitoria_id INTO v_id FROM public.child_auto_publications q
    WHERE q.status='pending' AND q.next_attempt_at<=now()
    ORDER BY q.created_at,q.monitoria_id FOR UPDATE SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE public.child_auto_publications q
    SET status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes',
      attempts=q.attempts+1,updated_at=now()
    WHERE q.monitoria_id=v_id RETURNING q.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_child_auto_publication() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_child_auto_publication() TO service_role;

-- Manual sends and the worker share this claim. The worker may publish a
-- decision made by an evaluator who has since been deactivated.
CREATE OR REPLACE FUNCTION public.claim_helpdesk_publication(p_monitoria uuid,p_caller uuid,p_force boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_claim public.helpdesk_publish_claims; v_monitoria public.monitorias; v_id uuid;
BEGIN
  SELECT * INTO v_monitoria FROM public.monitorias WHERE id=p_monitoria FOR UPDATE;
  IF v_monitoria.id IS NULL OR NOT v_monitoria.active
    OR v_monitoria.status NOT IN ('concluida','finalizada_alterada')
    OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_caller
      AND ((active AND (role IN ('admin','gestor_qualidade')
        OR (role='qualidade' AND v_monitoria.evaluator_id=p_caller)
        OR (role='gestor_suporte' AND v_monitoria.status='concluida'
          AND EXISTS (SELECT 1 FROM public.user_teams ut WHERE ut.user_id=p_caller AND ut.team_id=v_monitoria.team_id))))
        OR (auth.role()='service_role' AND v_monitoria.evaluator_id=p_caller))) THEN
    RAISE EXCEPTION 'Publicação não autorizada ou decisão não final.';
  END IF;
  SELECT * INTO v_claim FROM public.helpdesk_publish_claims WHERE monitoria_id=p_monitoria FOR UPDATE;
  IF v_claim.state IN ('sending','uncertain') THEN
    RAISE EXCEPTION 'Envio em andamento ou aguardando conferência no helpdesk. Não reenvie.';
  END IF;
  IF NOT coalesce(p_force,false) AND (v_claim.state='sent' OR EXISTS
      (SELECT 1 FROM public.helpdesk_submissions WHERE monitoria_id=p_monitoria AND status='sent'))
    THEN RETURN NULL; END IF;
  v_id:=gen_random_uuid();
  INSERT INTO public.helpdesk_publish_claims(monitoria_id,claim_id,state,created_by)
    VALUES(p_monitoria,v_id,'sending',p_caller)
    ON CONFLICT(monitoria_id) DO UPDATE SET claim_id=excluded.claim_id,
      state='sending',created_by=excluded.created_by,updated_at=now();
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.claim_positive_auto_publication()
RETURNS SETOF public.positive_auto_publications
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker não autorizado.' USING ERRCODE='42501'; END IF;
  UPDATE public.positive_auto_publications q SET status='sent',lease_id=NULL,lease_until=NULL,updated_at=now()
    WHERE q.status IN ('pending','processing') AND EXISTS (
      SELECT 1 FROM public.monitorias m JOIN public.helpdesk_submissions s ON s.monitoria_id=m.id
      WHERE m.id=q.monitoria_id AND s.status='sent'
        AND s.outcome=CASE WHEN m.score>=75 THEN 'positiva' ELSE 'negativa' END);
  UPDATE public.positive_auto_publications q SET status='uncertain',lease_id=NULL,lease_until=NULL,
      last_error='Envio iniciado anteriormente; confira o Zendesk antes de reenviar.',updated_at=now()
    WHERE q.status='processing' AND q.lease_until<now()
      AND EXISTS(SELECT 1 FROM public.helpdesk_publish_claims c WHERE c.monitoria_id=q.monitoria_id);
  UPDATE public.positive_auto_publications q SET status='pending',lease_id=NULL,lease_until=NULL,updated_at=now()
    WHERE q.status='processing' AND q.lease_until<now()
      AND NOT EXISTS(SELECT 1 FROM public.helpdesk_publish_claims c WHERE c.monitoria_id=q.monitoria_id);
  UPDATE public.positive_auto_publications q SET status='skipped',lease_id=NULL,lease_until=NULL,
      last_error='A monitoria deixou de ser a decisão final ativa deste ticket.',updated_at=now()
    WHERE q.status='pending' AND NOT EXISTS (
      SELECT 1 FROM public.monitorias m WHERE m.id=q.monitoria_id AND m.active IS TRUE
        AND m.status IN ('concluida','finalizada_alterada') AND m.score BETWEEN 0 AND 100
        AND btrim(m.ticket_id)=q.ticket_id
        AND m.form_id IS DISTINCT FROM '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
        AND coalesce(m.form_snapshot->>'legacy_source','') <> 'zendesk_child_note'
        AND NOT EXISTS(SELECT 1 FROM public.monitorias newer WHERE newer.ticket_id=m.ticket_id
          AND newer.active IS TRUE AND (newer.created_at,newer.id)>(m.created_at,m.id)));
  SELECT q.monitoria_id INTO v_id FROM public.positive_auto_publications q
    WHERE q.status='pending' AND q.next_attempt_at<=now()
    ORDER BY q.created_at,q.monitoria_id FOR UPDATE SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE public.positive_auto_publications q
    SET status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes',
      attempts=q.attempts+1,updated_at=now()
    WHERE q.monitoria_id=v_id RETURNING q.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_helpdesk_publication(uuid,uuid,boolean),
  public.claim_positive_auto_publication() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_helpdesk_publication(uuid,uuid,boolean),
  public.claim_positive_auto_publication() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
