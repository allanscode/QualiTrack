-- Rebalance automatic, pending queue work whenever the online monitor set
-- changes. Manual assignments remain sticky while their owner is online and
-- work already in progress is never moved automatically.

CREATE OR REPLACE FUNCTION public.assign_queue_tickets(p_tickets JSONB)
RETURNS TABLE(ticket_id TEXT, queue_type TEXT, assigned_to UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_item JSONB;
  v_ticket_id TEXT;
  v_queue_type TEXT;
  v_candidate UUID;
  v_existing public.queue_ticket_assignments%ROWTYPE;
  v_caller_id UUID := (SELECT auth.uid());
  v_can_see_all BOOLEAN := _private.is_admin_user();
BEGIN
  IF NOT _private.is_quality_team_user() THEN
    RAISE EXCEPTION 'Apenas a equipe de Qualidade pode distribuir chamados da fila de triagem.';
  END IF;

  IF jsonb_typeof(p_tickets) <> 'array' THEN
    RAISE EXCEPTION 'A lista de tickets da fila é inválida.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('qwp_queue_distribution'));

  -- Snapshot da carga que não será redistribuída nesta chamada. Os tickets
  -- automáticos pendentes recebidos em p_tickets ficam fora da carga inicial
  -- e são recolocados, em ordem estável, no monitor menos carregado.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.queue_rebalance_load (
    user_id UUID PRIMARY KEY,
    ticket_count INTEGER NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.queue_rebalance_load;

  INSERT INTO pg_temp.queue_rebalance_load(user_id, ticket_count)
  SELECT p.user_id, count(a.id)::INTEGER
  FROM public.quality_monitor_presence p
  JOIN public.users u
    ON u.id = p.user_id
   AND u.active
   AND u.role = 'qualidade'
  LEFT JOIN public.queue_ticket_assignments a
    ON a.assigned_to = p.user_id
   AND (a.assigned_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
   AND NOT (
     a.status = 'pending'
     AND a.assignment_source = 'automatic'
     AND EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_tickets) input_item
       WHERE input_item->>'ticket_id' = a.ticket_id
         AND input_item->>'queue_type' = a.queue_type
     )
   )
  WHERE p.is_enabled
    AND _private.is_user_online(p.user_id)
  GROUP BY p.user_id;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_tickets)
    ORDER BY value->>'queue_type', value->>'ticket_id'
  LOOP
    v_ticket_id := v_item->>'ticket_id';
    v_queue_type := v_item->>'queue_type';
    v_candidate := NULL;
    v_existing := NULL;

    IF v_ticket_id IS NULL OR v_queue_type NOT IN ('negativas', 'filhos') THEN
      CONTINUE;
    END IF;

    SELECT a.* INTO v_existing
    FROM public.queue_ticket_assignments a
    WHERE a.ticket_id = v_ticket_id AND a.queue_type = v_queue_type
    FOR UPDATE;

    -- Trabalho iniciado/concluído nunca muda automaticamente.
    IF v_existing.id IS NOT NULL AND v_existing.status IN ('in_progress', 'completed') THEN
      v_candidate := v_existing.assigned_to;
    ELSIF v_existing.id IS NOT NULL
      AND v_existing.assignment_source = 'manual'
      AND EXISTS (
        SELECT 1
        FROM pg_temp.queue_rebalance_load load
        WHERE load.user_id = v_existing.assigned_to
      )
    THEN
      -- A escolha manual prevalece enquanto o responsável estiver apto e online.
      v_candidate := v_existing.assigned_to;
    ELSE
      SELECT load.user_id INTO v_candidate
      FROM pg_temp.queue_rebalance_load load
      ORDER BY load.ticket_count, load.user_id
      LIMIT 1;

      IF v_candidate IS NULL THEN
        IF v_existing.id IS NOT NULL AND v_existing.status = 'pending' THEN
          DELETE FROM public.queue_ticket_assignments a WHERE a.id = v_existing.id;
        END IF;
        CONTINUE;
      END IF;

      IF v_existing.id IS NULL THEN
        INSERT INTO public.queue_ticket_assignments(
          ticket_id, queue_type, assigned_to, status, assignment_source, assigned_by
        )
        VALUES (v_ticket_id, v_queue_type, v_candidate, 'pending', 'automatic', NULL)
        ON CONFLICT ON CONSTRAINT queue_ticket_assignments_ticket_id_queue_type_key
        DO UPDATE SET
          assigned_to = EXCLUDED.assigned_to,
          assigned_at = now(),
          status = 'pending',
          assignment_source = 'automatic',
          assigned_by = NULL,
          started_at = NULL,
          started_by = NULL;
      ELSIF v_existing.assigned_to IS DISTINCT FROM v_candidate
        OR v_existing.assignment_source <> 'automatic'
      THEN
        UPDATE public.queue_ticket_assignments a
        SET assigned_to = v_candidate,
            assigned_at = now(),
            status = 'pending',
            assignment_source = 'automatic',
            assigned_by = NULL,
            started_at = NULL,
            started_by = NULL
        WHERE a.id = v_existing.id;
      END IF;

      UPDATE pg_temp.queue_rebalance_load
      SET ticket_count = ticket_count + 1
      WHERE user_id = v_candidate;
    END IF;

    IF v_can_see_all OR v_candidate = v_caller_id THEN
      ticket_id := v_ticket_id;
      queue_type := v_queue_type;
      assigned_to := v_candidate;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_queue_tickets(JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_queue_tickets(JSONB) FROM anon, PUBLIC;

NOTIFY pgrst, 'reload schema';
