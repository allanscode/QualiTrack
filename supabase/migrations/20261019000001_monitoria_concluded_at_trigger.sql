BEGIN;

CREATE OR REPLACE FUNCTION public.set_monitoria_concluded_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'concluida' AND (
    TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluida'
  ) THEN
    NEW.concluded_at := now();
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'concluida'
    AND NEW.status IS DISTINCT FROM 'concluida' THEN
    NEW.concluded_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_monitoria_concluded_at ON public.monitorias;
CREATE TRIGGER set_monitoria_concluded_at
BEFORE INSERT OR UPDATE OF status ON public.monitorias
FOR EACH ROW
EXECUTE FUNCTION public.set_monitoria_concluded_at();

REVOKE ALL ON FUNCTION public.set_monitoria_concluded_at() FROM PUBLIC, anon, authenticated;

COMMIT;
