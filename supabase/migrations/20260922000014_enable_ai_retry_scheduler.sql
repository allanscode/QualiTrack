-- Keep the retry scheduler reproducible on a fresh Supabase project.
-- Worker invocation credentials are configured separately in Vault; no AI
-- provider credential is stored in the database.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'wp-quality-ai-retries',
  '* * * * *',
  'SELECT _private.invoke_ai_retry_worker()'
);
