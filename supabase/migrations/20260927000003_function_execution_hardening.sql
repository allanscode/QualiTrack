-- Reduce exposed maintenance/trigger entry points without changing business RPCs.
BEGIN;
ALTER FUNCTION public.set_ai_guidelines_updated_at() SET search_path = '';
ALTER FUNCTION public.set_ai_drafts_updated_at() SET search_path = '';
REVOKE ALL ON FUNCTION public.process_action_deadline_timeouts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_action_deadline_timeouts() TO service_role;

DO $$
DECLARE fn record;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
  END LOOP;
  -- Some older installations retain the renamed scheduler. Never expose it as RPC.
  IF to_regprocedure('public.process_sla_timeouts()') IS NOT NULL THEN
    ALTER FUNCTION public.process_sla_timeouts() SET search_path = 'public';
    REVOKE ALL ON FUNCTION public.process_sla_timeouts() FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
