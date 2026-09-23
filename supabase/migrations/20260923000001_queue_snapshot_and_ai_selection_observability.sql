ALTER TABLE public.queue_ticket_catalog
  ADD COLUMN IF NOT EXISTS ticket_snapshot JSONB;

ALTER TABLE public.ai_evaluation_logs
  ADD COLUMN IF NOT EXISTS selection_context JSONB,
  ADD COLUMN IF NOT EXISTS error_stage TEXT;

CREATE INDEX IF NOT EXISTS idx_queue_ticket_catalog_recent
  ON public.queue_ticket_catalog(queue_type, verified_at DESC);

COMMENT ON COLUMN public.queue_ticket_catalog.ticket_snapshot IS
  'Short-lived Zendesk projection. Service-role only; consumers enforce verified_at TTL.';
COMMENT ON COLUMN public.ai_evaluation_logs.selection_context IS
  'Automatic versus effective form/manual selection and override explanation.';

NOTIFY pgrst, 'reload schema';
