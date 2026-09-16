-- MANUAL, AFTER fresh install and review of the automatic approval rule.
-- Run only on the new, confirmed project. No automatic activation by the builder.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('process-action-deadline','*/5 * * * *','SELECT public.process_action_deadline_timeouts();');
