-- A removed test monitoria must not leave its queue assignment completed.
CREATE OR REPLACE FUNCTION public.reopen_assignment_after_monitoria_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ticket_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ticket_id := NULLIF(btrim(OLD.ticket_id), '');
  ELSIF NEW.active IS DISTINCT FROM false THEN
    RETURN NEW;
  ELSE
    v_ticket_id := NULLIF(btrim(NEW.ticket_id), '');
  END IF;

  IF v_ticket_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.monitorias m
    WHERE btrim(m.ticket_id) = v_ticket_id
      AND m.active IS DISTINCT FROM false
  ) THEN
    UPDATE public.queue_ticket_assignments a
    SET status = 'pending', completed_at = NULL,
        started_at = NULL, started_by = NULL
    WHERE a.ticket_id = v_ticket_id AND a.status = 'completed';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_assignment_after_monitoria_removal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS reopen_assignment_after_monitoria_removal ON public.monitorias;
CREATE TRIGGER reopen_assignment_after_monitoria_removal
  AFTER DELETE OR UPDATE OF active ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION public.reopen_assignment_after_monitoria_removal();
