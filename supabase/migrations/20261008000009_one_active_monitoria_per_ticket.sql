BEGIN;

-- A ticket has one current decision. Keep the most recently changed record;
-- older evaluations remain available under Removed for audit and appeals.
WITH ranked AS (
  SELECT id,
    first_value(id) OVER ticket_order AS current_id,
    row_number() OVER ticket_order AS position
  FROM public.monitorias
  WHERE active IS TRUE AND nullif(btrim(ticket_id), '') IS NOT NULL
  WINDOW ticket_order AS (
    PARTITION BY btrim(ticket_id)
    ORDER BY coalesce(updated_at, created_at) DESC NULLS LAST,
      created_at DESC NULLS LAST, id DESC
  )
)
UPDATE public.monitorias AS m
SET active = false,
    updated_at = now(),
    history = coalesce(m.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', 'Monitoria anterior arquivada por duplicidade',
      'by_name', 'Sistema',
      'at', now(),
      'note', 'Decisão atual preservada na monitoria ' || ranked.current_id::text
    ))
FROM ranked
WHERE m.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX monitorias_one_active_per_ticket_idx
  ON public.monitorias ((btrim(ticket_id)))
  WHERE active IS TRUE AND nullif(btrim(ticket_id), '') IS NOT NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
