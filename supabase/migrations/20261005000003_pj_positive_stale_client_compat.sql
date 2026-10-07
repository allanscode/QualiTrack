-- A tab opened before the PJ rule change can still submit a positive monitoria
-- with the old pending status. Normalize that payload on insert.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_pj_review_route()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_is_pj boolean;
BEGIN
  SELECT coalesce(t.requires_pj_review, false) INTO v_is_pj
  FROM public.teams t WHERE t.id = NEW.team_id;
  IF TG_OP = 'INSERT' THEN
    NEW.pj_review_required := coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE);
    IF NOT coalesce(v_is_pj, false) THEN RETURN NEW; END IF;
    IF NEW.pj_reviewer_id IS NOT NULL OR NEW.pj_review_kind IS NOT NULL
      OR NEW.pj_review_decision IS NOT NULL OR NEW.pj_review_note IS NOT NULL
      OR NEW.pj_reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'O parecer PJ não pode ser pré-preenchido.';
    END IF;
    IF NEW.pj_review_required AND NEW.status <> 'pendente_revisao' THEN
      RAISE EXCEPTION 'Monitorias PJ com nota inferior a 75 devem começar na revisão do gestor PJ.';
    ELSIF NOT NEW.pj_review_required AND NEW.status = 'pendente_revisao' THEN
      NEW.status := 'concluida';
      NEW.resolution_type := 'human';
      NEW.action_deadline_at := NULL;
      NEW.history := coalesce(NEW.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action', 'Monitoria concluída automaticamente por nota positiva PJ',
        'by_id', NULL, 'by_name', 'Sistema', 'at', now(),
        'note', 'Formulário anterior à atualização enviou status pendente; regra de nota positiva aplicada.'));
    ELSIF NOT NEW.pj_review_required AND NEW.status <> 'concluida' THEN
      RAISE EXCEPTION 'Monitorias PJ com nota igual ou superior a 75 devem ser concluídas.';
    END IF;
    RETURN NEW;
  END IF;

  NEW.pj_review_required := OLD.pj_review_required
    OR (coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE));
  IF NOT NEW.pj_review_required THEN RETURN NEW; END IF;
  IF NOT OLD.pj_review_required AND NEW.status <> 'pendente_revisao' THEN
    RAISE EXCEPTION 'Monitorias PJ que passaram a ter nota inferior a 75 devem iniciar revisão do gestor PJ.';
  END IF;

  IF NEW.status = 'pendente_revisao' AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.pj_reviewer_id := NULL;
    NEW.pj_review_kind := NULL;
    NEW.pj_review_decision := NULL;
    NEW.pj_review_note := NULL;
    NEW.pj_reviewed_at := NULL;
  END IF;
  IF NEW.status = 'aguardando_revisao_pj' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status NOT IN ('pendente_revisao','aguardando_gestor_suporte')
      OR NEW.pj_reviewer_id IS NULL OR NEW.pj_review_kind IS NULL
      OR current_setting('app.pj_manager_action', true) IS DISTINCT FROM OLD.id::text THEN
      RAISE EXCEPTION 'O parecer do gestor PJ e o revisor são obrigatórios.';
    END IF;
  END IF;
  IF OLD.status IS DISTINCT FROM 'pendente_revisao'
    AND NEW.status = 'pendente_revisao' THEN
    IF (SELECT auth.uid()) IS NOT NULL
      AND _private.current_active_role() NOT IN ('admin','gestor_qualidade','qualidade') THEN
      RAISE EXCEPTION 'Somente a Qualidade pode reiniciar o fluxo PJ.';
    END IF;
  ELSIF (NEW.pj_reviewer_id, NEW.pj_review_kind) IS DISTINCT FROM
    (OLD.pj_reviewer_id, OLD.pj_review_kind)
    AND current_setting('app.pj_manager_action', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'O revisor PJ só pode ser atribuído pelo parecer do gestor.';
  END IF;
  IF (NEW.pj_review_decision, NEW.pj_review_note, NEW.pj_reviewed_at) IS DISTINCT FROM
    (OLD.pj_review_decision, OLD.pj_review_note, OLD.pj_reviewed_at)
    AND NEW.status <> 'pendente_revisao'
    AND current_setting('app.pj_reviewer_action', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'O parecer de Victor só pode ser registrado pelo revisor designado.';
  END IF;
  IF OLD.status = 'aguardando_revisao_pj' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status <> 'aguardando_gestor_qualidade'
      OR NEW.pj_review_decision IS NULL OR NEW.pj_reviewed_at IS NULL
      OR (SELECT auth.uid()) IS DISTINCT FROM OLD.pj_reviewer_id
      OR current_setting('app.pj_reviewer_action', true) IS DISTINCT FROM OLD.id::text THEN
      RAISE EXCEPTION 'Somente o revisor PJ designado pode encaminhar à Qualidade.';
    END IF;
  END IF;
  IF NEW.status = 'aguardando_gestor_qualidade' AND OLD.status IS DISTINCT FROM NEW.status
    AND OLD.status <> 'aguardando_revisao_pj' THEN
    RAISE EXCEPTION 'A revisão de Victor deve preceder a Gestão da Qualidade.';
  END IF;
  IF NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada',
      'em_contestacao','reavaliacao_solicitada')
    AND OLD.status IS DISTINCT FROM NEW.status AND NEW.pj_review_decision IS NULL THEN
    RAISE EXCEPTION 'Monitoria PJ aguarda o parecer de Victor antes da decisão final.';
  END IF;
  IF NEW.pj_review_kind = 'contestation'
    AND NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada')
    AND OLD.status IS DISTINCT FROM NEW.status
    AND coalesce(NEW.contestation_result, '') NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'A decisão final deve resolver a contestação PJ.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_pj_review_route() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
