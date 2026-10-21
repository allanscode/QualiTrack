BEGIN;

-- Reconcile only the two production monitorias whose current final QWP verdict
-- differs from the last confirmed Zendesk publication at release time.
DO $$
DECLARE
  v_candidates integer;
  v_ready integer;
BEGIN
  WITH latest AS (
    SELECT m.id, btrim(m.ticket_id) AS ticket_id,
      CASE WHEN m.score >= 75 THEN 'positiva' ELSE 'negativa' END AS outcome
    FROM public.monitorias m
    WHERE m.id IN (
      '2e6d91f8-a55f-44f1-abfc-cf55fdf3a617'::uuid,
      '291befd8-42e7-4b12-b2f9-dfdb3cff5086'::uuid
    )
      AND m.active IS TRUE
      AND m.status IN ('concluida', 'finalizada_alterada')
      AND m.score BETWEEN 0 AND 100
      AND btrim(m.ticket_id) ~ '^[0-9]+$'
      AND m.form_id NOT IN (
        '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
      )
      AND coalesce(m.form_snapshot->>'legacy_source', '') <> 'zendesk_child_note'
      AND NOT EXISTS (
        SELECT 1 FROM public.monitorias newer
        WHERE newer.ticket_id = m.ticket_id AND newer.active IS TRUE
          AND (newer.created_at, newer.id) > (m.created_at, m.id)
      )
  ), last_sent AS (
    SELECT DISTINCT ON (s.monitoria_id)
      s.monitoria_id, s.external_ticket_id, s.outcome
    FROM public.helpdesk_submissions s
    WHERE s.provider = 'zendesk' AND s.status = 'sent'
    ORDER BY s.monitoria_id, s.created_at DESC, s.id DESC
  ), mismatches AS (
    SELECT latest.id, latest.ticket_id
    FROM latest JOIN last_sent
      ON last_sent.monitoria_id = latest.id
      AND last_sent.external_ticket_id = latest.ticket_id
    WHERE latest.outcome = 'positiva' AND last_sent.outcome = 'negativa'
  )
  SELECT count(*) INTO v_candidates FROM mismatches;

  -- Production has the two original rows. Clean installs and test databases
  -- have neither row, so an empty reconciliation is a valid no-op.
  IF v_candidates NOT IN (0, 2) THEN
    RAISE EXCEPTION 'Esperados zero ou dois vereditos divergentes para reconciliação; encontrados %.', v_candidates;
  END IF;

  WITH latest AS (
    SELECT m.id, btrim(m.ticket_id) AS ticket_id,
      CASE WHEN m.score >= 75 THEN 'positiva' ELSE 'negativa' END AS outcome
    FROM public.monitorias m
    WHERE m.id IN (
      '2e6d91f8-a55f-44f1-abfc-cf55fdf3a617'::uuid,
      '291befd8-42e7-4b12-b2f9-dfdb3cff5086'::uuid
    )
      AND m.active IS TRUE AND m.status IN ('concluida', 'finalizada_alterada')
      AND m.score BETWEEN 0 AND 100 AND btrim(m.ticket_id) ~ '^[0-9]+$'
      AND m.form_id NOT IN (
        '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
        '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
      )
      AND coalesce(m.form_snapshot->>'legacy_source', '') <> 'zendesk_child_note'
      AND NOT EXISTS (
        SELECT 1 FROM public.monitorias newer
        WHERE newer.ticket_id = m.ticket_id AND newer.active IS TRUE
          AND (newer.created_at, newer.id) > (m.created_at, m.id)
      )
  ), last_sent AS (
    SELECT DISTINCT ON (s.monitoria_id)
      s.monitoria_id, s.external_ticket_id, s.outcome
    FROM public.helpdesk_submissions s
    WHERE s.provider = 'zendesk' AND s.status = 'sent'
    ORDER BY s.monitoria_id, s.created_at DESC, s.id DESC
  )
  INSERT INTO public.positive_auto_publications(monitoria_id, ticket_id, source)
  SELECT latest.id, latest.ticket_id, 'final_verdict'
  FROM latest JOIN last_sent
    ON last_sent.monitoria_id = latest.id
    AND last_sent.external_ticket_id = latest.ticket_id
  WHERE latest.outcome = 'positiva' AND last_sent.outcome = 'negativa'
  ON CONFLICT (monitoria_id) DO UPDATE SET
    ticket_id = EXCLUDED.ticket_id, source = 'final_verdict', status = 'pending',
    attempts = 0, next_attempt_at = now(), lease_id = NULL, lease_until = NULL,
    last_error = NULL, updated_at = now()
  WHERE public.positive_auto_publications.status IN ('sent', 'skipped');

  SELECT count(*) INTO v_ready
  FROM public.positive_auto_publications
  WHERE monitoria_id IN (
    '2e6d91f8-a55f-44f1-abfc-cf55fdf3a617'::uuid,
    '291befd8-42e7-4b12-b2f9-dfdb3cff5086'::uuid
  ) AND status IN ('pending', 'processing', 'sent');

  IF v_ready <> v_candidates THEN
    RAISE EXCEPTION 'A fila de reconciliação não corresponde aos candidatos; esperados %, encontrados %.', v_candidates, v_ready;
  END IF;
END $$;

COMMIT;
