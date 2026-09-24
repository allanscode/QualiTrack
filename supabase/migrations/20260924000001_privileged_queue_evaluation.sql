-- Allow Administrador and Supervisor de Qualidade to open any distributed-queue
-- evaluation while preserving the exclusive in-progress lock.

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
  v_can_override BOOLEAN := _private.is_admin_user();
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
  IF v_assignment.assigned_to <> v_caller AND NOT v_can_override THEN
    RAISE EXCEPTION 'Este ticket está atribuído a outro monitor.';
  END IF;
  IF v_assignment.status = 'in_progress'
     AND v_assignment.started_by IS DISTINCT FROM v_caller
     AND NOT v_can_override THEN
    RAISE EXCEPTION 'Este ticket já está em avaliação por outro monitor.';
  END IF;

  UPDATE public.queue_ticket_assignments a
  SET status = 'in_progress',
      started_at = CASE
        WHEN a.started_by IS DISTINCT FROM v_caller THEN now()
        ELSE COALESCE(a.started_at, now())
      END,
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
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_can_override BOOLEAN := _private.is_admin_user();
BEGIN
  UPDATE public.queue_ticket_assignments a
  SET status = 'pending', started_at = NULL, started_by = NULL
  WHERE a.ticket_id = p_ticket_id
    AND a.queue_type = p_queue_type
    AND a.status = 'in_progress'
    AND a.started_by = v_caller
    AND (a.assigned_to = v_caller OR v_can_override);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_queue_ticket_assignment(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.release_queue_ticket_assignment(TEXT, TEXT) FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_queue_assignment_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_assignment public.queue_ticket_assignments%ROWTYPE;
  v_caller UUID := (SELECT auth.uid());
  v_caller_role TEXT;
BEGIN
  SELECT u.role INTO v_caller_role
  FROM public.users u
  WHERE u.id = v_caller;

  IF v_caller_role = 'qualidade' THEN
    SELECT a.* INTO v_assignment
    FROM public.queue_ticket_assignments a
    WHERE a.ticket_id = NEW.ticket_id
      AND a.status IN ('pending', 'in_progress')
    ORDER BY a.assigned_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_assignment.id IS NOT NULL AND v_assignment.assigned_to <> v_caller THEN
      RAISE EXCEPTION 'Este ticket foi transferido para outro monitor e não pode mais ser salvo nesta sessão.';
    END IF;
    IF v_assignment.id IS NOT NULL
       AND v_assignment.status = 'in_progress'
       AND v_assignment.started_by IS NOT NULL
       AND v_assignment.started_by <> v_caller THEN
      RAISE EXCEPTION 'Este ticket está em avaliação por outro usuário e não pode ser salvo nesta sessão.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_queue_draft_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_assignment public.queue_ticket_assignments%ROWTYPE;
  v_caller UUID := (SELECT auth.uid());
  v_caller_role TEXT;
BEGIN
  SELECT u.role INTO v_caller_role
  FROM public.users u
  WHERE u.id = v_caller;

  IF v_caller_role = 'qualidade' THEN
    SELECT a.* INTO v_assignment
    FROM public.queue_ticket_assignments a
    WHERE a.ticket_id = NEW.ticket_id
      AND a.status IN ('pending', 'in_progress')
    ORDER BY a.assigned_at DESC
    LIMIT 1;

    IF v_assignment.id IS NOT NULL AND v_assignment.assigned_to <> v_caller THEN
      RAISE EXCEPTION 'Este ticket foi transferido para outro monitor e o rascunho não pode ser salvo.';
    END IF;
    IF v_assignment.id IS NOT NULL
       AND v_assignment.status = 'in_progress'
       AND v_assignment.started_by IS NOT NULL
       AND v_assignment.started_by <> v_caller THEN
      RAISE EXCEPTION 'Este ticket está em avaliação por outro usuário e o rascunho não pode ser salvo.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
