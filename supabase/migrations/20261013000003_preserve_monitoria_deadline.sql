-- The action clock belongs to the monitoring cycle, not to each status.
-- Keep its original limit across client updates and SECURITY DEFINER RPCs.
BEGIN;

CREATE OR REPLACE FUNCTION public.preserve_monitoria_action_deadline()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.active
    AND NEW.active
    AND OLD.status NOT IN ('concluida', 'finalizada_alterada')
    AND NEW.status NOT IN ('concluida', 'finalizada_alterada')
    AND OLD.action_deadline_at IS NOT NULL THEN
    NEW.action_deadline_at := OLD.action_deadline_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.preserve_monitoria_action_deadline() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_preserve_monitoria_action_deadline ON public.monitorias;
CREATE TRIGGER trg_preserve_monitoria_action_deadline
  BEFORE UPDATE OF status ON public.monitorias
  FOR EACH ROW EXECUTE FUNCTION public.preserve_monitoria_action_deadline();

COMMIT;
