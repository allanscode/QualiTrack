-- Show the historical Zendesk evaluation date as the monitoria date while
-- retaining a separate, truthful record of when QWP imported it.
BEGIN;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.legacy_child_note_receipts r
  JOIN public.monitorias m ON m.id=r.monitoria_id
  WHERE m.form_snapshot->>'legacy_source'='zendesk_child_note';
  IF v_count=0 AND NOT EXISTS (SELECT 1 FROM public.legacy_child_note_receipts) THEN
    RETURN;
  END IF;
  IF v_count <> 132 THEN
    RAISE EXCEPTION 'Expected 132 historical monitorias, found %', v_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.legacy_child_note_receipts r
    JOIN public.monitorias m ON m.id=r.monitoria_id
    WHERE jsonb_typeof(m.history) <> 'array' OR jsonb_array_length(m.history) <> 1
      OR m.history->0->>'action' <> 'Parecer histórico importado'
      OR r.imported_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unexpected historical timeline; correction cancelled.';
  END IF;
END $$;

UPDATE public.monitorias m
SET created_at=r.zendesk_comment_at,
    analysis_date=(r.zendesk_comment_at AT TIME ZONE 'America/Sao_Paulo')::date,
    history=jsonb_build_array(
      jsonb_set(jsonb_set(m.history->0, '{at}', to_jsonb(r.zendesk_comment_at)),
        '{action}', to_jsonb('Parecer recebido no Zendesk'::text)),
      jsonb_build_object(
        'action','Importação para o QWP',
        'at',r.imported_at,
        'by_id',null,
        'by_name','Sistema',
        'note','Monitoria histórica criada no QWP a partir do parecer já registrado no Zendesk.'
      )
    )
FROM public.legacy_child_note_receipts r
WHERE m.id=r.monitoria_id
  AND m.form_snapshot->>'legacy_source'='zendesk_child_note';

COMMIT;
