BEGIN;

-- Direct Zendesk inspection confirmed these three latest active child
-- monitorias are negative in QWP but positive in Zendesk. Each ticket is
-- closed and already tagged qwp_filho_avaliado; the child worker will update
-- only custom fields and will not post comments or change its other tags.
DO $$
DECLARE v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.monitorias WHERE id IN (
    '7433ef7a-7bea-441e-bae2-b0eac9aea6f8'::uuid,
    '28773365-5def-4bd3-9d90-1ce9620bff2d'::uuid,
    '371ccd86-4817-4c9d-8e89-7481a6c4eb71'::uuid
  )) THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.monitorias
      WHERE (id,ticket_id,active,status) IN (
        ('7433ef7a-7bea-441e-bae2-b0eac9aea6f8'::uuid,'180134',true,'concluida'),
        ('28773365-5def-4bd3-9d90-1ce9620bff2d'::uuid,'180330',true,'concluida'),
        ('371ccd86-4817-4c9d-8e89-7481a6c4eb71'::uuid,'181261',true,'concluida')
      ) AND score < 75) <> 3 THEN
    RAISE EXCEPTION 'Os três vereditos negativos mudaram; reprocessamento cancelado.';
  END IF;

  UPDATE public.child_auto_publications
  SET status='pending', attempts=0, next_attempt_at=now(), lease_id=NULL,
      lease_until=NULL, last_error=NULL, updated_at=now()
  WHERE (monitoria_id,ticket_id) IN (
    ('7433ef7a-7bea-441e-bae2-b0eac9aea6f8'::uuid,'180134'),
    ('28773365-5def-4bd3-9d90-1ce9620bff2d'::uuid,'180330'),
    ('371ccd86-4817-4c9d-8e89-7481a6c4eb71'::uuid,'181261')
  ) AND status='sent';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'A fila dos três chamados filhos mudou; reprocessamento cancelado.';
  END IF;
END $$;

COMMIT;
