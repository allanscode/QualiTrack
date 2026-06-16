-- =================================================================
-- Fix: change vw_monitorias_suporte from SECURITY DEFINER (default)
-- to SECURITY INVOKER, so RLS policies of the querying user apply
-- =================================================================

ALTER VIEW public.vw_monitorias_suporte SET (security_invoker = on);
