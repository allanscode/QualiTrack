BEGIN;

-- Automated evaluations keep the executive summary in the AI snapshot while
-- the same auditor-record field used by a manual monitoria carries the final note.
CREATE FUNCTION public.set_automatic_auditor_record()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_record text;
BEGIN
  IF NEW.form_snapshot->>'automation' IN ('positive_csat', 'child_ticket') THEN
    v_record := btrim(NEW.form_snapshot#>>'{ai_evaluation,auditor_record}');
    IF v_record IS NOT NULL AND v_record <> '' THEN
      NEW.evaluator_note := v_record;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.set_automatic_auditor_record() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER set_automatic_auditor_record
BEFORE INSERT ON public.monitorias
FOR EACH ROW EXECUTE FUNCTION public.set_automatic_auditor_record();

COMMIT;
