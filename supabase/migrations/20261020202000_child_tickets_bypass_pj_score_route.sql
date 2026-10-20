BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_pj_review_route()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_is_pj boolean; v_standard_positive_critical boolean := false;
BEGIN
  IF NEW.form_snapshot->>'legacy_source' = 'zendesk_child_note' THEN
    IF TG_OP = 'INSERT' THEN
      IF auth.role() = 'authenticated' OR NOT EXISTS (
        SELECT 1 FROM public.legacy_child_note_receipts r
        WHERE r.ticket_id = btrim(NEW.ticket_id)
          AND r.zendesk_comment_id::text = NEW.form_snapshot->>'legacy_comment_id'
          AND r.original_job_id::text = NEW.form_snapshot->>'legacy_original_job_id'
      ) THEN RAISE EXCEPTION 'ImportaÃ§Ã£o histÃ³rica sem recibo autorizado.'; END IF;
    ELSIF OLD.form_snapshot->>'legacy_source' IS DISTINCT FROM 'zendesk_child_note'
      OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id
      OR NEW.form_snapshot->>'legacy_comment_id' IS DISTINCT FROM OLD.form_snapshot->>'legacy_comment_id'
      OR NEW.form_snapshot->>'legacy_original_job_id' IS DISTINCT FROM OLD.form_snapshot->>'legacy_original_job_id'
      OR NEW.form_snapshot->>'legacy_verdict' IS DISTINCT FROM OLD.form_snapshot->>'legacy_verdict'
      OR NEW.form_snapshot->'legacy_comment_at' IS DISTINCT FROM OLD.form_snapshot->'legacy_comment_at'
      OR NEW.form_snapshot->'legacy_original_score' IS DISTINCT FROM OLD.form_snapshot->'legacy_original_score'
      OR NEW.form_snapshot->'legacy_original_result' IS DISTINCT FROM OLD.form_snapshot->'legacy_original_result'
      OR NEW.form_snapshot->'legacy_six_criteria_draft' IS DISTINCT FROM OLD.form_snapshot->'legacy_six_criteria_draft'
      OR NEW.form_snapshot->'sections' IS DISTINCT FROM OLD.form_snapshot->'sections'
      OR NEW.answers IS DISTINCT FROM OLD.answers
      OR NEW.question_observations IS DISTINCT FROM OLD.question_observations
      OR NEW.score IS DISTINCT FROM OLD.score
      OR NEW.evaluator_note IS DISTINCT FROM OLD.evaluator_note THEN
      RAISE EXCEPTION 'ProveniÃªncia histÃ³rica nÃ£o pode ser alterada.';
    END IF;
    NEW.pj_review_required := false;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.form_snapshot->>'legacy_source' = 'zendesk_child_note' THEN
    RAISE EXCEPTION 'ProveniÃªncia histÃ³rica nÃ£o pode ser removida.';
  END IF;

  -- Child tickets use a binary verdict and a NULL score, so they do not enter
  -- the score-based PJ review workflow even when their team requires PJ review.
  IF NEW.form_id IN (
    '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
    '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
    '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
    '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
    '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
  ) OR NEW.form_snapshot->>'ticket_kind' = 'chamado_filho'
    OR NEW.form_snapshot->>'automation' = 'child_ticket' THEN
    NEW.pj_review_required := false;
    RETURN NEW;
  END IF;
  SELECT coalesce(t.requires_pj_review, false) INTO v_is_pj
  FROM public.teams t WHERE t.id = NEW.team_id;
  -- Parecer positivo automÃ¡tico com erro crÃ­tico confirmado inicia o fluxo
  -- comum do gestor, inclusive nas equipes PJ. Somente o worker pode marcar
  -- essa rota no INSERT; o marcador Ã© preservado nas atualizaÃ§Ãµes seguintes.
  IF TG_OP = 'INSERT' THEN
    v_standard_positive_critical := current_setting('request.jwt.claim.role', true) = 'service_role'
      AND NEW.form_snapshot->>'automation' = 'positive_csat'
      AND (
        coalesce(array_length(NEW.selected_critical_errors, 1), 0) > 0
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(coalesce(NEW.form_snapshot->'sections', '[]'::jsonb)) section,
               jsonb_array_elements(coalesce(section.value->'questions', '[]'::jsonb)) question
          WHERE coalesce((question.value->>'is_critical')::boolean, false)
            AND NEW.answers->>(question.value->>'id') = 'NAO'
        )
      );
  ELSE
    v_standard_positive_critical := OLD.form_snapshot->>'review_route' = 'standard_manager';
  END IF;
  NEW.form_snapshot := coalesce(NEW.form_snapshot, '{}'::jsonb) - 'review_route';
  IF v_standard_positive_critical THEN
    NEW.form_snapshot := NEW.form_snapshot || jsonb_build_object('review_route', 'standard_manager');
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.pj_review_required := coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE) AND NOT v_standard_positive_critical;
    IF NOT coalesce(v_is_pj, false) OR v_standard_positive_critical THEN RETURN NEW; END IF;
    IF NEW.pj_reviewer_id IS NOT NULL OR NEW.pj_review_kind IS NOT NULL
      OR NEW.pj_review_decision IS NOT NULL OR NEW.pj_review_note IS NOT NULL
      OR NEW.pj_reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'O parecer PJ nÃ£o pode ser prÃ©-preenchido.';
    END IF;
    IF NEW.pj_review_required AND NEW.status <> 'pendente_revisao' THEN
      RAISE EXCEPTION 'Monitorias PJ com nota inferior a 75 devem comeÃ§ar na revisÃ£o do gestor PJ.';
    ELSIF NOT NEW.pj_review_required AND NEW.status = 'pendente_revisao' THEN
      NEW.status := 'concluida';
      NEW.resolution_type := 'human';
      NEW.action_deadline_at := NULL;
      NEW.history := coalesce(NEW.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action', 'Monitoria concluÃ­da automaticamente por nota positiva PJ',
        'by_id', NULL, 'by_name', 'Sistema', 'at', now(),
        'note', 'FormulÃ¡rio anterior Ã  atualizaÃ§Ã£o enviou status pendente; regra de nota positiva aplicada.'));
    ELSIF NOT NEW.pj_review_required AND NEW.status <> 'concluida' THEN
      RAISE EXCEPTION 'Monitorias PJ com nota igual ou superior a 75 devem ser concluÃ­das.';
    END IF;
    RETURN NEW;
  END IF;

  NEW.pj_review_required := OLD.pj_review_required
    OR (coalesce(v_is_pj, false) AND NOT ((NEW.score >= 75) IS TRUE) AND NOT v_standard_positive_critical);
  IF OLD.pj_review_required AND OLD.active AND OLD.status='pendente_revisao'
    AND NEW.status='concluida' AND NEW.score=OLD.score
    AND NEW.resolution_type='automatic' AND OLD.action_deadline_at<now()
    AND OLD.form_snapshot->>'automation'='positive_csat'
    AND current_setting('app.positive_ai_timeout',true)=OLD.id::text
    AND coalesce(current_setting('request.jwt.claim.role',true),'') NOT IN ('anon','authenticated') THEN
    RETURN NEW;
  END IF;
  IF NOT NEW.pj_review_required THEN RETURN NEW; END IF;
  IF NOT OLD.pj_review_required AND NEW.status <> 'pendente_revisao' THEN
    RAISE EXCEPTION 'Monitorias PJ que passaram a ter nota inferior a 75 devem iniciar revisÃ£o do gestor PJ.';
  END IF;

  IF NEW.status = 'pendente_revisao' AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.pj_reviewer_id := NULL;
    NEW.pj_review_kind := NULL;
    NEW.pj_review_decision := NULL;
    NEW.pj_review_note := NULL;
    NEW.pj_reviewed_at := NULL;
  END IF;
  IF NEW.status = 'aguardando_revisao_pj' AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'A etapa de revisÃ£o PJ foi encerrada; o parecer segue direto para a Qualidade.';
  END IF;
  IF OLD.status IS DISTINCT FROM 'pendente_revisao'
    AND NEW.status = 'pendente_revisao' THEN
    IF (SELECT auth.uid()) IS NOT NULL
      AND _private.current_active_role() NOT IN ('admin','gestor_qualidade','qualidade') THEN
      RAISE EXCEPTION 'Somente a Qualidade pode reiniciar o fluxo PJ.';
    END IF;
  ELSIF (NEW.pj_reviewer_id, NEW.pj_review_kind) IS DISTINCT FROM
    (OLD.pj_reviewer_id, OLD.pj_review_kind)
    AND (SELECT auth.uid()) IS NOT NULL
    AND current_setting('app.pj_manager_action', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'O tipo de parecer PJ sÃ³ pode ser registrado pela aÃ§Ã£o do gestor.';
  END IF;
  IF (NEW.pj_review_decision, NEW.pj_review_note, NEW.pj_reviewed_at) IS DISTINCT FROM
    (OLD.pj_review_decision, OLD.pj_review_note, OLD.pj_reviewed_at)
    AND NEW.status <> 'pendente_revisao'
    AND (SELECT auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'A etapa de parecer do revisor PJ foi encerrada.';
  END IF;
  IF NEW.status = 'aguardando_gestor_qualidade' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status NOT IN ('pendente_revisao','aguardando_gestor_suporte','aguardando_revisao_pj')
      OR NEW.pj_review_kind IS NULL THEN
      RAISE EXCEPTION 'O parecer do gestor PJ deve preceder a GestÃ£o da Qualidade.';
    END IF;
    IF OLD.status <> 'aguardando_revisao_pj'
      AND current_setting('app.pj_manager_action', true) IS DISTINCT FROM OLD.id::text
      AND (SELECT auth.uid()) IS NOT NULL THEN
      RAISE EXCEPTION 'Somente a aÃ§Ã£o do gestor PJ pode encaminhar Ã  Qualidade.';
    END IF;
  END IF;
  IF NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada',
      'em_contestacao','reavaliacao_solicitada')
    AND OLD.status IS DISTINCT FROM NEW.status AND NEW.pj_review_kind IS NULL THEN
    RAISE EXCEPTION 'Monitoria PJ aguarda o parecer do gestor antes da decisÃ£o final.';
  END IF;
  IF NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada')
    AND OLD.status IS DISTINCT FROM NEW.status
    AND OLD.status NOT IN ('aguardando_gestor_qualidade','reavaliacao_solicitada',
      'contestacao_negada','contestacao_aceita') THEN
    RAISE EXCEPTION 'A decisÃ£o da Qualidade deve preceder a conclusÃ£o PJ.';
  END IF;
  IF NEW.pj_review_kind = 'contestation'
    AND NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada')
    AND OLD.status IS DISTINCT FROM NEW.status
    AND coalesce(NEW.contestation_result, '') NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'A decisÃ£o final deve resolver a contestaÃ§Ã£o PJ.';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
