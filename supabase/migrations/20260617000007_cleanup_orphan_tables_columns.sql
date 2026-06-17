-- =================================================================
-- Cleanup: drop orphan table critical_criteria only
-- started_at, finished_at, concluded_at kept for V2 lifecycle feature
-- business_hours, holidays kept (used by calculate_action_deadline())
-- =================================================================

-- Guard: check if critical_criteria has data before dropping
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'critical_criteria' AND table_schema = 'public') THEN
    EXECUTE 'SELECT COUNT(*) FROM public.critical_criteria' INTO v_count;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'ABORTANDO: tabela critical_criteria contem % registro(s). Migre os dados antes de dropar.', v_count;
    END IF;
  END IF;
END $$;

-- Drop orphan table critical_criteria (never referenced by app code)
DROP TABLE IF EXISTS public.critical_criteria CASCADE;
