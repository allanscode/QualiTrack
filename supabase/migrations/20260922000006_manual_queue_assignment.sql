-- Manual reassignment and exclusive ownership for distributed audit queues.

ALTER TABLE public.queue_ticket_assignments
  ADD COLUMN IF NOT EXISTS assignment_source TEXT NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_by UUID REFERENCES public.users(id);

ALTER TABLE public.queue_ticket_assignments
  DROP CONSTRAINT IF EXISTS queue_ticket_assignments_assignment_source_check;
ALTER TABLE public.queue_ticket_assignments
  ADD CONSTRAINT queue_ticket_assignments_assignment_source_check
  CHECK (assignment_source IN ('automatic', 'manual'));

ALTER TABLE public.queue_ticket_assignments
  DROP CONSTRAINT IF EXISTS queue_ticket_assignments_status_check;
ALTER TABLE public.queue_ticket_assignments
  ADD CONSTRAINT queue_ticket_assignments_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed'));

-- All quality roles need the same assignment snapshot so that an UPDATE that
-- transfers a ticket is visible immediately through Realtime, including to
-- the monitor who just lost ownership. Mutations remain RPC-only.
DROP POLICY IF EXISTS "queue_ticket_assignments_select" ON public.queue_ticket_assignments;
CREATE POLICY "queue_ticket_assignments_select" ON public.queue_ticket_assignments
  FOR SELECT TO authenticated
  USING (_private.is_quality_team_user());

CREATE OR REPLACE FUNCTION public.start_queue_ticket_assignment(
  p_ticket_id TEXT,
  p_queue_type TEXT
)
RETURNS TABLE(
  ticket_id TEXT,
  queue_type TEXT,
  assigned_to UUID,
  status TEXT,
  assignment_source TEXT,
  started_at TIMESTAMPTZ,
  started_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_assignment public.queue_ticket_assignments%ROWTYPE;
  v_caller UUID := (SELECT auth.uid());
BEGIN
  IF NOT _private.is_quality_team_user() THEN
    RAISE EXCEPTION 'Apenas a equipe de Qualidade pode iniciar uma avaliação.';
  END IF;

  IF p_queue_type NOT IN ('negativas', 'filhos') THEN
    RAISE EXCEPTION 'Fila inválida.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('qwp_queue_distribution'));

  SELECT a.* INTO v_assignment
  FROM public.queue_ticket_assignments a
  WHERE a.ticket_id = p_ticket_id AND a.queue_type = p_queue_type
  FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Ticket sem monitor responsável.';
  END IF;
  IF v_assignment.status = 'completed' THEN
    RAISE EXCEPTION 'Este ticket já foi concluído.';
  END IF;
  IF v_assignment.assigned_to <> v_caller THEN
    RAISE EXCEPTION 'Este ticket está atribuído a outro monitor.';
  END IF;
  IF v_assignment.status = 'in_progress' AND v_assignment.started_by <> v_caller THEN
    RAISE EXCEPTION 'Este ticket já está em avaliação por outro monitor.';
  END IF;

  UPDATE public.queue_ticket_assignments a
  SET status = 'in_progress',
      started_at = COALESCE(a.started_at, now()),
      started_by = v_caller
  WHERE a.id = v_assignment.id
  RETURNING a.* INTO v_assignment;

  ticket_id := v_assignment.ticket_id;
  queue_type := v_assignment.queue_type;
  assigned_to := v_assignment.assigned_to;
  status := v_assignment.status;
  assignment_source := v_assignment.assignment_source;
  started_at := v_assignment.started_at;
  started_by := v_assignment.started_by;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_queue_ticket_assignment(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.start_queue_ticket_assignment(TEXT, TEXT) FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.release_queue_ticket_assignment(
  p_ticket_id TEXT,
  p_queue_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.queue_ticket_assignments a
  SET status = 'pending', started_at = NULL, started_by = NULL
  WHERE a.ticket_id = p_ticket_id
    AND a.queue_type = p_queue_type
    AND a.status = 'in_progress'
    AND a.assigned_to = (SELECT auth.uid())
    AND a.started_by = (SELECT auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_queue_ticket_assignment(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.release_queue_ticket_assignment(TEXT, TEXT) FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.reassign_queue_ticket(
  p_ticket_id TEXT,
  p_queue_type TEXT,
  p_monitor_id UUID,
  p_confirm_in_progress BOOLEAN DEFAULT false
)
RETURNS TABLE(
  ticket_id TEXT,
  queue_type TEXT,
  assigned_to UUID,
  status TEXT,
  assignment_source TEXT,
  started_at TIMESTAMPTZ,
  started_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_assignment public.queue_ticket_assignments%ROWTYPE;
BEGIN
  IF NOT _private.is_admin_user() THEN
    RAISE EXCEPTION 'Apenas o Supervisor de Qualidade ou o Administrador pode alterar o monitor.';
  END IF;

  IF p_queue_type NOT IN ('negativas', 'filhos') THEN
    RAISE EXCEPTION 'Fila inválida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.quality_monitor_presence p
    JOIN public.users u ON u.id = p.user_id
    WHERE p.user_id = p_monitor_id
      AND p.is_enabled
      AND u.active
      AND u.role = 'qualidade'
      AND _private.is_user_online(p.user_id)
  ) THEN
    RAISE EXCEPTION 'O monitor selecionado não está elegível e online.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('qwp_queue_distribution'));

  SELECT a.* INTO v_assignment
  FROM public.queue_ticket_assignments a
  WHERE a.ticket_id = p_ticket_id AND a.queue_type = p_queue_type
  FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Atribuição não encontrada.';
  END IF;
  IF v_assignment.status = 'completed' THEN
    RAISE EXCEPTION 'Não é possível transferir um ticket concluído.';
  END IF;
  IF v_assignment.status = 'in_progress' AND NOT p_confirm_in_progress THEN
    RAISE EXCEPTION 'CONFIRM_IN_PROGRESS: este ticket já está em avaliação.';
  END IF;

  UPDATE public.queue_ticket_assignments a
  SET assigned_to = p_monitor_id,
      assigned_at = now(),
      assignment_source = 'manual',
      assigned_by = (SELECT auth.uid()),
      status = 'pending',
      started_at = NULL,
      started_by = NULL
  WHERE a.id = v_assignment.id
  RETURNING a.* INTO v_assignment;

  ticket_id := v_assignment.ticket_id;
  queue_type := v_assignment.queue_type;
  assigned_to := v_assignment.assigned_to;
  status := v_assignment.status;
  assignment_source := v_assignment.assignment_source;
  started_at := v_assignment.started_at;
  started_by := v_assignment.started_by;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_queue_ticket(TEXT, TEXT, UUID, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reassign_queue_ticket(TEXT, TEXT, UUID, BOOLEAN) FROM anon, PUBLIC;

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

  PERFORM pg_advisory_xact_lock(hashtext('qwp_queue_distribution'));

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_tickets)
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
    WHERE a.ticket_id = v_ticket_id AND a.queue_type = v_queue_type;

    -- Work already started is never moved automatically, even if the owner
    -- temporarily disconnects. A supervisor can transfer it explicitly.
    IF v_existing.id IS NOT NULL AND v_existing.status = 'in_progress' THEN
      v_candidate := v_existing.assigned_to;
    ELSIF v_existing.id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.quality_monitor_presence p
      JOIN public.users u ON u.id = p.user_id AND u.active AND u.role = 'qualidade'
      WHERE p.user_id = v_existing.assigned_to
        AND p.is_enabled
        AND _private.is_user_online(p.user_id)
    ) THEN
      -- This also protects a manual assignment from the balancing pass while
      -- its chosen monitor remains eligible and online.
      v_candidate := v_existing.assigned_to;
    END IF;

    IF v_candidate IS NULL THEN
      SELECT p.user_id INTO v_candidate
      FROM public.quality_monitor_presence p
      JOIN public.users u ON u.id = p.user_id AND u.active AND u.role = 'qualidade'
      LEFT JOIN public.queue_ticket_assignments a
        ON a.assigned_to = p.user_id
       AND (a.assigned_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
      WHERE p.is_enabled
        AND _private.is_user_online(p.user_id)
      GROUP BY p.user_id
      ORDER BY count(a.id), p.user_id
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
      ELSE
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

-- A monitor whose assignment was transferred while their form remained open
-- cannot save a second evaluation for the same queue ticket.
CREATE OR REPLACE FUNCTION public.enforce_queue_assignment_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_assignment public.queue_ticket_assignments%ROWTYPE;
  v_caller_role TEXT;
BEGIN
  SELECT u.role INTO v_caller_role
  FROM public.users u
  WHERE u.id = (SELECT auth.uid());

  IF v_caller_role = 'qualidade' THEN
    SELECT a.* INTO v_assignment
    FROM public.queue_ticket_assignments a
    WHERE a.ticket_id = NEW.ticket_id
      AND a.status IN ('pending', 'in_progress')
    ORDER BY a.assigned_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_assignment.id IS NOT NULL AND v_assignment.assigned_to <> (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'Este ticket foi transferido para outro monitor e não pode mais ser salvo nesta sessão.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_queue_assignment_owner ON public.monitorias;
CREATE TRIGGER trg_enforce_queue_assignment_owner
  BEFORE INSERT ON public.monitorias
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_queue_assignment_owner();

CREATE OR REPLACE FUNCTION public.enforce_queue_draft_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_assigned_to UUID;
  v_caller_role TEXT;
BEGIN
  SELECT u.role INTO v_caller_role
  FROM public.users u
  WHERE u.id = (SELECT auth.uid());

  IF v_caller_role = 'qualidade' THEN
    SELECT a.assigned_to INTO v_assigned_to
    FROM public.queue_ticket_assignments a
    WHERE a.ticket_id = NEW.ticket_id
      AND a.status IN ('pending', 'in_progress')
    ORDER BY a.assigned_at DESC
    LIMIT 1;

    IF v_assigned_to IS NOT NULL AND v_assigned_to <> (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'Este ticket foi transferido para outro monitor e o rascunho não pode ser salvo.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_queue_draft_owner ON public.ai_evaluation_drafts;
CREATE TRIGGER trg_enforce_queue_draft_owner
  BEFORE INSERT OR UPDATE ON public.ai_evaluation_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_queue_draft_owner();

CREATE OR REPLACE FUNCTION public.complete_queue_assignment_on_monitoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.queue_ticket_assignments
  SET status = 'completed', completed_at = now()
  WHERE ticket_id = NEW.ticket_id AND status IN ('pending', 'in_progress');
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
