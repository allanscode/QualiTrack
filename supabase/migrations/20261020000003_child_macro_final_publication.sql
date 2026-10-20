BEGIN;

-- Derive the binary verdict from the frozen rubric, not from a numeric score.
-- A missing answer (or any answer other than SIM) makes the verdict invalid.
CREATE OR REPLACE FUNCTION public.child_macro_publication_verdict(
  p_form_snapshot jsonb, p_answers jsonb
) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  WITH questions AS (
    SELECT question.value->>'id' AS question_id
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_form_snapshot->'sections')='array'
      THEN p_form_snapshot->'sections' ELSE '[]'::jsonb END) section
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(section.value->'questions')='array'
      THEN section.value->'questions' ELSE '[]'::jsonb END) question
  ), derived AS (
    SELECT CASE
      WHEN count(*)=0 OR count(*) FILTER (WHERE nullif(btrim(question_id),'') IS NULL)>0 THEN NULL
      WHEN bool_and(coalesce(p_answers->>question_id='SIM',false)) THEN 'valido'
      ELSE 'invalido'
    END AS verdict FROM questions
  )
  SELECT CASE
    WHEN p_form_snapshot->>'child_verdict' IN ('valido','invalido')
      AND p_form_snapshot->>'child_verdict' IS DISTINCT FROM derived.verdict THEN NULL
    ELSE derived.verdict
  END FROM derived;
$$;
REVOKE ALL ON FUNCTION public.child_macro_publication_verdict(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.capture_child_auto_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.active IS TRUE
    AND NEW.status IN ('concluida','finalizada_alterada')
    AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.score IS DISTINCT FROM NEW.score OR OLD.active IS DISTINCT FROM NEW.active
      OR (NEW.form_id IN (
          '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
          '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
          '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
          '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid)
        AND (OLD.answers IS DISTINCT FROM NEW.answers OR OLD.form_snapshot IS DISTINCT FROM NEW.form_snapshot
          OR OLD.evaluator_note IS DISTINCT FROM NEW.evaluator_note OR OLD.form_id IS DISTINCT FROM NEW.form_id
          OR OLD.ticket_id IS DISTINCT FROM NEW.ticket_id)))
    AND btrim(NEW.ticket_id) ~ '^[0-9]+$'
    AND NEW.form_id IN (
      '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid)
    AND coalesce(NEW.form_snapshot->>'legacy_source','') <> 'zendesk_child_note'
    AND nullif(btrim(coalesce(NEW.evaluator_note,'')),'') IS NOT NULL
    AND (
      (NEW.form_id='6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
        AND NEW.score BETWEEN 0 AND 100
        AND (coalesce(NEW.form_snapshot->>'automation','') <> 'child_ticket'
          OR NEW.form_snapshot#>>'{child_ai_evaluation,status}'='conforme'
          OR TG_OP='UPDATE'))
      OR (NEW.form_id IN (
          '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
          '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
          '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
          '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid)
        AND public.child_macro_publication_verdict(NEW.form_snapshot,NEW.answers) IN ('valido','invalido'))
    ) THEN
    INSERT INTO public.child_auto_publications(monitoria_id,ticket_id)
      VALUES(NEW.id,btrim(NEW.ticket_id))
      ON CONFLICT(monitoria_id) DO UPDATE SET
        ticket_id=EXCLUDED.ticket_id,status='pending',attempts=0,next_attempt_at=now(),
        lease_id=NULL,lease_until=NULL,last_error=NULL,updated_at=now()
      WHERE public.child_auto_publications.status='skipped';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_child_auto_publication() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS capture_child_auto_publication ON public.monitorias;
CREATE TRIGGER capture_child_auto_publication
  AFTER INSERT OR UPDATE OF status,score,active,answers,form_snapshot,evaluator_note,form_id,ticket_id
  ON public.monitorias FOR EACH ROW EXECUTE FUNCTION public.capture_child_auto_publication();

CREATE OR REPLACE FUNCTION public.claim_child_auto_publication() RETURNS SETOF public.child_auto_publications
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Worker nao autorizado.' USING ERRCODE='42501';
  END IF;
  UPDATE public.child_auto_publications q SET status='uncertain',lease_id=NULL,lease_until=NULL,
      last_error='Envio interrompido; confira os comentarios e campos do Zendesk antes de reenviar.',updated_at=now()
    WHERE q.status='processing' AND q.lease_until<now();
  UPDATE public.child_auto_publications q SET status='skipped',lease_id=NULL,lease_until=NULL,
      last_error='A monitoria deixou de ser um chamado filho concluido elegivel para publicacao.',updated_at=now()
    WHERE q.status='pending' AND NOT EXISTS(
      SELECT 1 FROM public.monitorias m WHERE m.id=q.monitoria_id AND m.active IS TRUE
        AND m.status IN ('concluida','finalizada_alterada') AND btrim(m.ticket_id)=q.ticket_id
        AND m.form_id IN (
          '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
          '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
          '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
          '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
          '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid)
        AND coalesce(m.form_snapshot->>'legacy_source','') <> 'zendesk_child_note'
        AND nullif(btrim(coalesce(m.evaluator_note,'')),'') IS NOT NULL
        AND (
          (m.form_id='6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
            AND m.score BETWEEN 0 AND 100)
          OR (m.form_id IN (
              '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
              '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
              '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
              '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid)
            AND public.child_macro_publication_verdict(m.form_snapshot,m.answers) IN ('valido','invalido'))
        )
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

-- Capture completed macro forms that predate the trigger replacement.
INSERT INTO public.child_auto_publications(monitoria_id,ticket_id)
  SELECT m.id,btrim(m.ticket_id) FROM public.monitorias m
  WHERE m.active IS TRUE AND m.status IN ('concluida','finalizada_alterada')
    AND btrim(m.ticket_id) ~ '^[0-9]+$'
    AND m.form_id IN (
      '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid)
    AND coalesce(m.form_snapshot->>'legacy_source','') <> 'zendesk_child_note'
    AND nullif(btrim(coalesce(m.evaluator_note,'')),'') IS NOT NULL
    AND public.child_macro_publication_verdict(m.form_snapshot,m.answers) IN ('valido','invalido')
    AND NOT EXISTS(SELECT 1 FROM public.monitorias newer WHERE newer.ticket_id=m.ticket_id
      AND newer.active IS TRUE AND (newer.created_at,newer.id)>(m.created_at,m.id))
  ON CONFLICT(monitoria_id) DO NOTHING;

NOTIFY pgrst,'reload schema';
COMMIT;
