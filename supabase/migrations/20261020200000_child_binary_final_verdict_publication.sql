BEGIN;

-- Child tickets now store a binary child_verdict and a NULL score. Requeue a
-- publication only when an active final child verdict is newly recorded or
-- changes. This intentionally does not backfill existing tickets: that would
-- send Zendesk updates without an explicit reconciliation decision.
CREATE OR REPLACE FUNCTION public.capture_child_auto_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_changed := true;
  ELSE
    v_changed := OLD.status IS DISTINCT FROM NEW.status
      OR OLD.child_verdict IS DISTINCT FROM NEW.child_verdict
      OR OLD.active IS DISTINCT FROM NEW.active;
  END IF;

  IF NEW.active IS TRUE
    AND NEW.status IN ('concluida', 'finalizada_alterada')
    AND v_changed
    AND btrim(NEW.ticket_id) ~ '^[0-9]+$'
    AND (
      NEW.form_id IN (
        '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
      )
      OR NEW.form_snapshot->>'ticket_kind' = 'chamado_filho'
      OR NEW.form_snapshot->>'automation' = 'child_ticket'
    )
    AND coalesce(NEW.form_snapshot->>'legacy_source', '') <> 'zendesk_child_note'
    AND NEW.child_verdict IN ('valido', 'invalido')
    AND nullif(btrim(coalesce(NEW.evaluator_note, '')), '') IS NOT NULL
    AND (
      coalesce(NEW.form_snapshot->>'automation', '') <> 'child_ticket'
      OR NEW.form_snapshot#>>'{child_ai_evaluation,status}' = 'conforme'
      OR TG_OP = 'UPDATE'
    ) THEN
    INSERT INTO public.child_auto_publications(monitoria_id, ticket_id)
      VALUES (NEW.id, btrim(NEW.ticket_id))
      ON CONFLICT (monitoria_id) DO UPDATE SET
        ticket_id = EXCLUDED.ticket_id,
        status = 'pending',
        attempts = 0,
        next_attempt_at = now(),
        lease_id = NULL,
        lease_until = NULL,
        last_error = NULL,
        updated_at = now()
      WHERE public.child_auto_publications.status IN ('pending', 'sent', 'skipped');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_child_auto_publication() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS capture_child_auto_publication ON public.monitorias;
CREATE TRIGGER capture_child_auto_publication
  AFTER INSERT OR UPDATE OF status, child_verdict, active ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION public.capture_child_auto_publication();

-- Do not discard a binary child publication as invalid merely because score is
-- NULL. Keep expired leases uncertain so an ambiguous Zendesk write is never
-- repeated automatically.
CREATE OR REPLACE FUNCTION public.claim_child_auto_publication()
RETURNS SETOF public.child_auto_publications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Worker não autorizado.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.child_auto_publications q
  SET status = 'uncertain', lease_id = NULL, lease_until = NULL,
      last_error = 'Envio interrompido; confira os comentários e campos do Zendesk antes de reenviar.',
      updated_at = now()
  WHERE q.status = 'processing' AND q.lease_until < now();

  UPDATE public.child_auto_publications q
  SET status = 'skipped', lease_id = NULL, lease_until = NULL,
      last_error = 'A monitoria deixou de ser um chamado filho concluído elegível para publicação.',
      updated_at = now()
  WHERE q.status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM public.monitorias m
      WHERE m.id = q.monitoria_id
        AND m.active IS TRUE
        AND m.status IN ('concluida', 'finalizada_alterada')
        AND btrim(m.ticket_id) = q.ticket_id
        AND (
          m.form_id IN (
            '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
            '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
            '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
            '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
            '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
          )
          OR m.form_snapshot->>'ticket_kind' = 'chamado_filho'
          OR m.form_snapshot->>'automation' = 'child_ticket'
        )
        AND coalesce(m.form_snapshot->>'legacy_source', '') <> 'zendesk_child_note'
        AND m.child_verdict IN ('valido', 'invalido')
        AND nullif(btrim(coalesce(m.evaluator_note, '')), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.monitorias newer
          WHERE newer.ticket_id = m.ticket_id AND newer.active IS TRUE
            AND (newer.created_at, newer.id) > (m.created_at, m.id)
        )
    );

  SELECT q.monitoria_id INTO v_id
  FROM public.child_auto_publications q
  WHERE q.status = 'pending' AND q.next_attempt_at <= now()
  ORDER BY q.created_at, q.monitoria_id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  RETURN QUERY
  UPDATE public.child_auto_publications q
  SET status = 'processing', lease_id = gen_random_uuid(),
      lease_until = now() + interval '3 minutes', attempts = q.attempts + 1,
      updated_at = now()
  WHERE q.monitoria_id = v_id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_child_auto_publication() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_child_auto_publication() TO service_role;

COMMIT;
