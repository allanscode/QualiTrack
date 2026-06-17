-- =================================================================
-- Cleanup: drop orphan column monitorias.satisfaction
-- App uses satisfaction_result, satisfaction_has_record,
-- satisfaction_record_text. Standalone 'satisfaction' is unused.
-- =================================================================

ALTER TABLE IF EXISTS public.monitorias DROP COLUMN IF EXISTS satisfaction;
