-- Audit records are server-owned. A browser must not be able to forge them.
DROP POLICY IF EXISTS "Authenticated can insert ai_evaluation_logs" ON public.ai_evaluation_logs;
REVOKE INSERT, UPDATE, DELETE ON public.ai_evaluation_logs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_evaluation_logs TO service_role;

-- These privileges bypass RLS or are unnecessary for browser roles.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
