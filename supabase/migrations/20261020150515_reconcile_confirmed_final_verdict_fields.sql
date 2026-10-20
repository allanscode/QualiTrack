BEGIN;

-- Zendesk was inspected directly before this reconciliation. Both current
-- tickets have Avaliação do Atendimento=positiva, Analisado=true, and the
-- matching positiva/analisado_qa tags. No Zendesk write or comment is issued.
DO $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.monitorias
    WHERE id='291befd8-42e7-4b12-b2f9-dfdb3cff5086'::uuid
      AND ticket_id='180231' AND active IS TRUE
      AND status IN ('concluida','finalizada_alterada') AND score >= 75
  ) OR NOT EXISTS (
    SELECT 1 FROM public.monitorias
    WHERE id='2e6d91f8-a55f-44f1-abfc-cf55fdf3a617'::uuid
      AND ticket_id='185573' AND active IS TRUE
      AND status IN ('concluida','finalizada_alterada') AND score >= 75
  ) THEN
    RAISE EXCEPTION 'A decisão final positiva dos dois tickets mudou; reconciliação cancelada.';
  END IF;

  UPDATE public.helpdesk_submissions
  SET status='sent',
      external_comment_id='fields-confirmed:180231',
      error_message=NULL
  WHERE id='d54b7613-f249-4f31-934f-62644c8251a7'::uuid
    AND monitoria_id='291befd8-42e7-4b12-b2f9-dfdb3cff5086'::uuid
    AND external_ticket_id='180231' AND outcome='positiva' AND status='failed';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Recibo incerto do ticket 180231 mudou; reconciliação cancelada.'; END IF;

  UPDATE public.helpdesk_submissions
  SET status='sent',
      external_comment_id='fields-confirmed:185573',
      error_message=NULL
  WHERE id='01b2eb5a-9c3e-44bb-9a1e-4390f1cb766e'::uuid
    AND monitoria_id='2e6d91f8-a55f-44f1-abfc-cf55fdf3a617'::uuid
    AND external_ticket_id='185573' AND outcome='positiva' AND status='failed';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Recibo incerto do ticket 185573 mudou; reconciliação cancelada.'; END IF;

  UPDATE public.helpdesk_publish_claims
  SET state='sent', updated_at=now()
  WHERE monitoria_id IN (
    '291befd8-42e7-4b12-b2f9-dfdb3cff5086'::uuid,
    '2e6d91f8-a55f-44f1-abfc-cf55fdf3a617'::uuid
  ) AND state='uncertain';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Claims dos dois tickets não estavam incertos; reconciliação cancelada.'; END IF;

  UPDATE public.positive_auto_publications
  SET status='sent', lease_id=NULL, lease_until=NULL,
      last_error=NULL, updated_at=now()
  WHERE monitoria_id IN (
    '291befd8-42e7-4b12-b2f9-dfdb3cff5086'::uuid,
    '2e6d91f8-a55f-44f1-abfc-cf55fdf3a617'::uuid
  ) AND ticket_id IN ('180231','185573') AND status='uncertain';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Fila dos dois tickets não estava incerta; reconciliação cancelada.'; END IF;
END $$;

COMMIT;
