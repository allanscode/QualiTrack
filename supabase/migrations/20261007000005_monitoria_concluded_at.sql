BEGIN;

-- Databases upgraded from the legacy schema may lack this field even though
-- deadline processing and automatic positive evaluations already use it.
ALTER TABLE public.monitorias ADD COLUMN IF NOT EXISTS concluded_at timestamptz;

COMMENT ON COLUMN public.monitorias.concluded_at IS 'Recorded completion time; legacy completed records may be null.';

NOTIFY pgrst, 'reload schema';
COMMIT;
