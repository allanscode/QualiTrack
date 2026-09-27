-- Restore the documented server-owned deadline processing cadence.
-- cron.schedule with a stable name updates an existing schedule idempotently.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('process-action-deadline', '*/5 * * * *',
  'SELECT public.process_action_deadline_timeouts();');
COMMIT;
