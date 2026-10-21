BEGIN;

-- A Quality Manager's changed score to >= 75 is the final decision. Clear
-- the previous PJ review flag before the trigger's normal sticky-flag rule.
DO $$
DECLARE
  v_definition text;
  v_start integer;
  v_end integer;
  v_old text;
  v_new text := $replacement$
  IF _private.current_active_role() IN ('admin','gestor_qualidade')
    AND OLD.active IS TRUE
    AND OLD.status IN ('pendente_revisao','aguardando_gestor_suporte')
    AND OLD.score IS DISTINCT FROM NEW.score
    AND NEW.score >= 75
    AND NEW.status = 'concluida' THEN
    NEW.pj_review_required := false;
    NEW.resolution_type := 'human';
    NEW.action_deadline_at := NULL;
  ELSE
    NEW.pj_review_required := OLD.pj_review_required
      OR (coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE) AND NOT v_standard_positive_critical);
  END IF;
$replacement$;
BEGIN
  v_definition := pg_get_functiondef('public.enforce_pj_review_route()'::regprocedure);
  v_start := strpos(v_definition, '  NEW.pj_review_required := OLD.pj_review_required');
  IF v_start = 0 THEN
    RAISE EXCEPTION 'PJ route assignment not found; migration stopped without changing it.';
  END IF;
  v_end := strpos(substr(v_definition, v_start), ';');
  IF v_end = 0 THEN
    RAISE EXCEPTION 'PJ route assignment is incomplete; migration stopped without changing it.';
  END IF;
  v_old := substr(v_definition, v_start, v_end);
  IF position('OLD.pj_review_required' IN v_old) = 0
    OR position('v_standard_positive_critical' IN v_old) = 0 THEN
    RAISE EXCEPTION 'Unexpected PJ route assignment; migration stopped without changing it.';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;

COMMIT;
