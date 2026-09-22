-- The browser cannot nominate arbitrary Zendesk IDs for assignment. Only the
-- Edge Function, after reading a configured Zendesk view, populates this cache
-- and invokes the service-only assignment RPC.
CREATE TABLE IF NOT EXISTS public.queue_ticket_catalog (
  ticket_id TEXT NOT NULL CHECK (ticket_id ~ '^[0-9]+$'),
  queue_type TEXT NOT NULL CHECK (queue_type IN ('negativas', 'positivas', 'proativas', 'filhos', 'filhos_invalidos')),
  parent_ticket_id TEXT CHECK (parent_ticket_id IS NULL OR parent_ticket_id ~ '^[0-9]+$'),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, queue_type)
);
CREATE INDEX IF NOT EXISTS queue_ticket_catalog_parent_idx ON public.queue_ticket_catalog(parent_ticket_id)
  WHERE parent_ticket_id IS NOT NULL;
ALTER TABLE public.queue_ticket_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.queue_ticket_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_ticket_catalog TO service_role;

CREATE OR REPLACE FUNCTION public.assign_queue_tickets(p_tickets JSONB)
RETURNS TABLE(ticket_id TEXT, queue_type TEXT, assigned_to UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_item JSONB;
  v_id TEXT;
  v_type TEXT;
  v_owner UUID;
  v_existing public.queue_ticket_assignments%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'A distribuição é exclusiva do serviço.'; END IF;
  IF jsonb_typeof(p_tickets) <> 'array' OR jsonb_array_length(p_tickets) > 25 THEN
    RAISE EXCEPTION 'Lista de tickets inválida.';
  END IF;
  PERFORM _private.rebalance_pending_queue();
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_tickets) ORDER BY value->>'queue_type', value->>'ticket_id' LOOP
    v_id := v_item->>'ticket_id'; v_type := v_item->>'queue_type'; v_owner := NULL;
    IF v_id !~ '^[0-9]+$' OR v_type NOT IN ('negativas', 'filhos') THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.queue_ticket_catalog c
      WHERE c.ticket_id = v_id AND c.queue_type = v_type
        AND c.verified_at > now() - interval '15 minutes') THEN CONTINUE; END IF;
    SELECT a.* INTO v_existing FROM public.queue_ticket_assignments a
      WHERE a.ticket_id = v_id AND a.queue_type = v_type FOR UPDATE;
    IF v_existing.id IS NOT NULL THEN
      v_owner := v_existing.assigned_to;
    ELSE
      SELECT l.user_id INTO v_owner FROM pg_temp.queue_load l ORDER BY l.amount, l.user_id LIMIT 1;
      IF v_owner IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.queue_ticket_assignments(ticket_id, queue_type, assigned_to, status, assignment_source)
      VALUES (v_id, v_type, v_owner, 'pending', 'automatic')
      ON CONFLICT ON CONSTRAINT queue_ticket_assignments_ticket_id_queue_type_key DO NOTHING;
      UPDATE pg_temp.queue_load SET amount = amount + 1 WHERE user_id = v_owner;
    END IF;
    ticket_id := v_id; queue_type := v_type; assigned_to := v_owner; RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_queue_tickets(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_queue_tickets(JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
