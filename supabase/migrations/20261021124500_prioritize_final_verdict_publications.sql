BEGIN;

-- Corrected final decisions take priority over initial auto-positive events.
-- This prevents already divergent Zendesk verdicts from waiting behind newly
-- created CSAT publications in the same durable queue.
DO $$
DECLARE
  v_definition text;
  v_old text := 'ORDER BY q.created_at,q.monitoria_id';
  v_new text := 'ORDER BY CASE WHEN q.source = ''final_verdict'' THEN 0 ELSE 1 END,q.created_at,q.monitoria_id';
BEGIN
  v_definition := pg_get_functiondef('public.claim_positive_auto_publication()'::regprocedure);
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Publication queue ordering changed; priority migration stopped without changes.';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;

UPDATE public.positive_auto_publications p
SET source = 'final_verdict', updated_at = now()
FROM public.monitorias m
WHERE m.id = p.monitoria_id
  AND m.ticket_id IN ('184371','185015','185512','185707','185729','185730',
    '185775','185858','185896','185900','186086')
  AND m.active IS TRUE AND m.status = 'concluida' AND m.score >= 75
  AND p.status = 'pending';

COMMIT;
