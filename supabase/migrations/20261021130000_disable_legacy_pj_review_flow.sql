BEGIN;

-- Keep the former PJ-review schema for historical records, but disable its
-- routing behavior. Every team follows the regular support/quality flow.
DO $$
DECLARE
  v_definition text;
  v_select text := $old$SELECT coalesce(t.requires_pj_review, false) INTO v_is_pj
  FROM public.teams t WHERE t.id = NEW.team_id;$old$;
  v_insert_flag text := 'NEW.pj_review_required := coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE) AND NOT v_standard_positive_critical;';
  v_update_flag text := $old$NEW.pj_review_required := OLD.pj_review_required
      OR (coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE) AND NOT v_standard_positive_critical);$old$;
  v_insert_return text := 'IF NOT coalesce(v_is_pj, false) OR v_standard_positive_critical THEN RETURN NEW; END IF;';
  v_update_return text := 'IF NOT NEW.pj_review_required THEN RETURN NEW; END IF;';
BEGIN
  v_definition := pg_get_functiondef('public.enforce_pj_review_route()'::regprocedure);
  IF position(v_select IN v_definition) = 0
    OR position(v_insert_flag IN v_definition) = 0
    OR position(v_update_flag IN v_definition) = 0
    OR position(v_insert_return IN v_definition) = 0
    OR position(v_update_return IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected enforce_pj_review_route definition; refusing to disable route unsafely.';
  END IF;

  v_definition := replace(v_definition, v_select, 'v_is_pj := false;');
  v_definition := replace(v_definition, v_insert_flag, 'NEW.pj_review_required := false;');
  v_definition := replace(v_definition, v_update_flag, 'NEW.pj_review_required := false;');
  v_definition := replace(v_definition, v_insert_return,
    $new$IF NEW.status = 'aguardando_revisao_pj' THEN
      NEW.status := 'aguardando_gestor_suporte';
      NEW.pj_reviewer_id := NULL;
      NEW.pj_review_kind := NULL;
      NEW.pj_review_decision := NULL;
      NEW.pj_review_note := NULL;
      NEW.pj_reviewed_at := NULL;
    END IF;
    IF NOT coalesce(v_is_pj, false) OR v_standard_positive_critical THEN RETURN NEW; END IF;$new$);
  v_definition := replace(v_definition, v_update_return,
    $new$IF NEW.status = 'aguardando_revisao_pj' THEN
      NEW.status := 'aguardando_gestor_suporte';
      NEW.pj_reviewer_id := NULL;
    END IF;
    IF NOT NEW.pj_review_required THEN RETURN NEW; END IF;$new$);
  EXECUTE v_definition;
END;
$$;

UPDATE public.teams SET requires_pj_review = false WHERE requires_pj_review IS DISTINCT FROM false;

-- The old reviewer queue is no longer an application surface. Remove its
-- authenticated entry points while leaving service-role access for audits.
REVOKE ALL ON TABLE public.vw_monitorias_pj_reviewer FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.review_pj_monitoria(uuid, text, text) FROM authenticated;

-- Existing decisions and history remain intact; only routing flags are cleared.
UPDATE public.monitorias
SET status = CASE WHEN status = 'aguardando_revisao_pj' THEN 'aguardando_gestor_suporte' ELSE status END,
    pj_review_required = false,
    pj_reviewer_id = CASE WHEN status = 'aguardando_revisao_pj' THEN NULL ELSE pj_reviewer_id END,
    history = CASE WHEN status = 'aguardando_revisao_pj'
      THEN coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action', 'Etapa PJ desativada; monitoria encaminhada ao fluxo padrão do Gestor de Suporte',
        'by_id', NULL, 'by_name', 'Sistema', 'at', now(),
        'note', 'Os campos legados de revisão PJ foram preservados para consulta histórica; a etapa não faz mais parte do fluxo.'))
      ELSE history END,
    updated_at = CASE WHEN status = 'aguardando_revisao_pj' THEN now() ELSE updated_at END
WHERE pj_review_required IS TRUE OR status = 'aguardando_revisao_pj';

COMMIT;
