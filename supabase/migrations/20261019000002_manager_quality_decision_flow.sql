-- Pending human evaluations enter Support management. Existing provenance and role guards remain intact.
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
      ) THEN RAISE EXCEPTION 'Importação histórica sem recibo autorizado.'; END IF;
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
      RAISE EXCEPTION 'Proveniência histórica não pode ser alterada.';
    END IF;
    NEW.pj_review_required := false;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.form_snapshot->>'legacy_source' = 'zendesk_child_note' THEN
    RAISE EXCEPTION 'Proveniência histórica não pode ser removida.';
  END IF;

  SELECT coalesce(t.requires_pj_review, false) INTO v_is_pj
  FROM public.teams t WHERE t.id = NEW.team_id;
  -- Parecer positivo automático com erro crítico confirmado inicia o fluxo
  -- comum do gestor, inclusive nas equipes PJ. Somente o worker pode marcar
  -- essa rota no INSERT; o marcador é preservado nas atualizações seguintes.
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
      RAISE EXCEPTION 'O parecer PJ não pode ser pré-preenchido.';
    END IF;
    IF NEW.pj_review_required AND NEW.status NOT IN ('pendente_revisao', 'aguardando_gestor_suporte') THEN
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
  -- Authorized manager decisions and Quality interventions use the common route.
  IF current_setting('app.monitoria_support_decision', true) = OLD.id::text
    OR _private.current_active_role() IN ('admin', 'gestor_qualidade') THEN
    RETURN NEW;
  END IF;
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
    RAISE EXCEPTION 'A etapa de revisão PJ foi encerrada; o parecer segue direto para a Qualidade.';
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
    RAISE EXCEPTION 'O tipo de parecer PJ só pode ser registrado pela ação do gestor.';
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
      RAISE EXCEPTION 'O parecer do gestor PJ deve preceder a Gestão da Qualidade.';
    END IF;
    IF OLD.status <> 'aguardando_revisao_pj'
      AND current_setting('app.pj_manager_action', true) IS DISTINCT FROM OLD.id::text
      AND (SELECT auth.uid()) IS NOT NULL THEN
      RAISE EXCEPTION 'Somente a ação do gestor PJ pode encaminhar à Qualidade.';
    END IF;
  END IF;
  IF NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada',
      'em_contestacao','reavaliacao_solicitada')
    AND OLD.status IS DISTINCT FROM NEW.status AND NEW.pj_review_kind IS NULL THEN
    RAISE EXCEPTION 'Monitoria PJ aguarda o parecer do gestor antes da decisão final.';
  END IF;
  IF NEW.status IN ('concluida','contestacao_aceita','contestacao_negada','finalizada_alterada')
    AND OLD.status IS DISTINCT FROM NEW.status
    AND OLD.status NOT IN ('aguardando_gestor_qualidade','reavaliacao_solicitada',
      'contestacao_negada','contestacao_aceita') THEN
    RAISE EXCEPTION 'A decisão da Qualidade deve preceder a conclusão PJ.';
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

-- Support decisions are serialized and scoped to the assigned team. The first
-- contestation and the repeat share a route; history records the round.
CREATE OR REPLACE FUNCTION public.act_on_monitoria_as_support_manager(
  p_monitoria_id uuid, p_action text, p_note text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_row public.monitorias%ROWTYPE;
  v_note text := btrim(coalesce(p_note, ''));
  v_attachment jsonb;
  v_round integer;
  v_conclude boolean;
  v_action text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = (SELECT auth.uid()) AND active FOR SHARE;
  IF v_user.id IS NULL OR v_user.role <> 'gestor_suporte' THEN
    RAISE EXCEPTION 'Apenas o Gestor de Suporte pode decidir esta avaliação.';
  END IF;
  SELECT * INTO v_row FROM public.monitorias WHERE id = p_monitoria_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT v_row.active
    OR v_row.status NOT IN ('pendente_revisao', 'aguardando_gestor_suporte')
    OR NOT EXISTS (SELECT 1 FROM public.user_teams ut
      WHERE ut.user_id = v_user.id AND ut.team_id = v_row.team_id)
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = v_row.team_id
      AND t.approval_manager_id IS NOT NULL AND t.approval_manager_id <> v_user.id) THEN
    RAISE EXCEPTION 'Avaliação indisponível para decisão deste gestor.';
  END IF;
  IF p_action NOT IN ('aceitar', 'aprovar', 'contestar', 'escalar')
    OR v_note = '' OR length(v_note) > 2000 THEN
    RAISE EXCEPTION 'Decisão ou justificativa inválida.';
  END IF;
  IF jsonb_typeof(p_attachments) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_attachments) > 20 THEN
    RAISE EXCEPTION 'Lista de anexos inválida.';
  END IF;
  FOR v_attachment IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
    IF jsonb_typeof(v_attachment) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_attachment->'path') IS DISTINCT FROM 'string'
      OR split_part(v_attachment->>'path', '/', 2) IS DISTINCT FROM v_row.id::text
      OR NOT coalesce(_private.can_access_monitoria_attachment(v_attachment->>'path', true), false)
      OR v_attachment ? 'url'
      OR NOT EXISTS (SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'monitoria-attachments' AND o.name = v_attachment->>'path') THEN
      RAISE EXCEPTION 'Anexo indisponível para esta avaliação.';
    END IF;
  END LOOP;

  SELECT count(*) INTO v_round FROM jsonb_array_elements(coalesce(v_row.history, '[]'::jsonb)) h
  WHERE h->>'action' LIKE 'Contestação realizada pelo Gestor de Suporte%'
    OR h->>'action' LIKE 'Gestor PJ encaminhou contestação%';
  v_conclude := p_action IN ('aceitar', 'aprovar');
  IF NOT v_conclude AND v_round >= 2 THEN
    RAISE EXCEPTION 'A segunda contestação já recebeu encaminhamento definitivo.';
  END IF;
  v_action := CASE WHEN v_conclude THEN 'Monitoria aprovada e concluída pelo Gestor de Suporte'
    WHEN v_round >= 1 THEN 'Contestação realizada pelo Gestor de Suporte (decisão definitiva da Qualidade)'
    ELSE 'Contestação realizada pelo Gestor de Suporte (primeira decisão da Qualidade)' END;

  PERFORM set_config('app.monitoria_support_decision', v_row.id::text, true);
  IF v_row.pj_review_required THEN
    PERFORM set_config('app.pj_manager_action', v_row.id::text, true);
  END IF;
  UPDATE public.monitorias SET
    status = CASE WHEN v_conclude THEN 'concluida' ELSE 'aguardando_gestor_qualidade' END,
    action_deadline_at = CASE WHEN v_conclude THEN NULL ELSE action_deadline_at END,
    resolution_type = CASE WHEN v_conclude THEN 'human' ELSE resolution_type END,
    corrective_action = CASE WHEN v_conclude THEN v_note ELSE corrective_action END,
    contestation_reason = CASE WHEN v_conclude THEN contestation_reason ELSE v_note END,
    contestation_result = CASE WHEN v_conclude THEN
      CASE WHEN v_round > 0 THEN 'rejected' ELSE contestation_result END ELSE 'pending' END,
    pj_review_kind = CASE WHEN NOT v_conclude AND pj_review_required THEN 'contestation' ELSE pj_review_kind END,
    action_attachments = coalesce(action_attachments, '[]'::jsonb) || p_attachments,
    history = coalesce(v_row.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', v_action, 'by_id', v_user.id, 'by_name', v_user.name,
      'at', now(), 'note', v_note, 'attachments', p_attachments)),
    updated_at = now()
  WHERE id = v_row.id;
END;
$$;
REVOKE ALL ON FUNCTION public.act_on_monitoria_as_support_manager(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_monitoria_as_support_manager(uuid, text, text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.act_on_monitoria_as_quality_manager(
  p_monitoria_id uuid, p_action text, p_note text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_row public.monitorias%ROWTYPE;
  v_round integer;
  v_action text;
  v_note text := btrim(coalesce(p_note, ''));
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = (SELECT auth.uid()) AND active FOR SHARE;
  IF v_user.id IS NULL OR v_user.role NOT IN ('admin', 'gestor_qualidade') THEN
    RAISE EXCEPTION 'Apenas a Gestão da Qualidade pode decidir esta contestação.';
  END IF;
  SELECT * INTO v_row FROM public.monitorias WHERE id = p_monitoria_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT v_row.active OR v_row.status <> 'aguardando_gestor_qualidade' THEN
    RAISE EXCEPTION 'Esta avaliação não aguarda decisão da Qualidade.';
  END IF;
  IF length(v_note) > 2000 OR jsonb_typeof(p_attachments) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_attachments) > 20 OR p_attachments <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Nota ou anexos inválidos para esta decisão.';
  END IF;
  SELECT count(*) INTO v_round FROM jsonb_array_elements(coalesce(v_row.history, '[]'::jsonb)) h
  WHERE h->>'action' LIKE 'Contestação realizada pelo Gestor de Suporte%'
    OR h->>'action' LIKE 'Gestor PJ encaminhou contestação%';
  IF p_action NOT IN ('aprovar', 'manter', 'invalidar')
    OR (p_action = 'manter' AND v_round <> 1)
    OR (p_action = 'invalidar' AND v_round < 2) THEN
    RAISE EXCEPTION 'Decisão incompatível com a rodada da contestação.';
  END IF;
  v_action := CASE p_action
    WHEN 'manter' THEN 'Primeira contestação negada pela Gestão da Qualidade; retorno ao Gestor de Suporte'
    WHEN 'invalidar' THEN 'Decisão definitiva da Qualidade: avaliação invalidada'
    ELSE 'Contestação validada pela Gestão da Qualidade; decisão final' END;
  UPDATE public.monitorias SET
    status = CASE WHEN p_action = 'manter' THEN 'aguardando_gestor_suporte' ELSE 'concluida' END,
    action_deadline_at = CASE WHEN p_action = 'manter' THEN action_deadline_at ELSE NULL END,
    resolution_type = CASE WHEN p_action = 'manter' THEN resolution_type ELSE 'human' END,
    contestation_result = CASE WHEN p_action = 'aprovar' THEN 'approved' ELSE 'rejected' END,
    history = coalesce(v_row.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', v_action, 'by_id', v_user.id, 'by_name', v_user.name,
      'at', now(), 'note', v_note)),
    updated_at = now()
  WHERE id = v_row.id;
END;
$$;
REVOKE ALL ON FUNCTION public.act_on_monitoria_as_quality_manager(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_monitoria_as_quality_manager(uuid, text, text, jsonb)
  TO authenticated;

-- A management stage intervention may restart an already expired action clock.
CREATE OR REPLACE FUNCTION public.preserve_monitoria_action_deadline()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF OLD.active AND NEW.active
    AND OLD.status NOT IN ('concluida', 'finalizada_alterada')
    AND NEW.status NOT IN ('concluida', 'finalizada_alterada')
    AND OLD.action_deadline_at IS NOT NULL
    AND NOT (OLD.action_deadline_at < now()
      AND NEW.action_deadline_at > now()
      AND NEW.status IS DISTINCT FROM OLD.status
      AND _private.current_active_role() IN ('admin', 'gestor_qualidade')) THEN
    NEW.action_deadline_at := OLD.action_deadline_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_monitoria_action_deadline() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_monitoria_update_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text; v_caller uuid := (SELECT auth.uid());
BEGIN
  IF v_caller IS NULL THEN RETURN NEW; END IF;
  SELECT role INTO v_role FROM public.users WHERE id = v_caller AND active;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Usuário inativo ou não autenticado.'; END IF;
  IF NEW.evaluator_id IS DISTINCT FROM OLD.evaluator_id AND OLD.evaluator_id IS NOT NULL THEN
    RAISE EXCEPTION 'Auditor responsável não pode ser alterado.';
  END IF;
  IF NEW.evaluated_id IS DISTINCT FROM OLD.evaluated_id AND OLD.evaluated_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = OLD.evaluated_id AND is_provisional) THEN
    RAISE EXCEPTION 'Atendente avaliado não pode ser alterado.';
  END IF;
  IF NEW.ticket_id IS DISTINCT FROM OLD.ticket_id AND OLD.ticket_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ticket associado não pode ser alterado.';
  END IF;
  IF NEW.form_id IS DISTINCT FROM OLD.form_id AND v_role NOT IN ('admin', 'gestor_qualidade') THEN
    RAISE EXCEPTION 'Formulário não pode ser alterado por este perfil.';
  END IF;
  IF NOT OLD.active AND v_role NOT IN ('admin', 'gestor_qualidade') THEN
    RAISE EXCEPTION 'Monitoria inativa não pode ser alterada.';
  END IF;

  IF current_setting('app.pj_reviewer_action', true) = OLD.id::text THEN
    IF v_role NOT IN ('suporte', 'gestor_suporte') THEN
      RAISE EXCEPTION 'Perfil não autorizado para a revisão PJ.';
    END IF;
      IF OLD.status <> 'aguardando_revisao_pj'
        OR NEW.status <> 'aguardando_gestor_qualidade'
        OR OLD.pj_reviewer_id IS DISTINCT FROM v_caller
        OR NEW.pj_review_decision NOT IN ('approved', 'rejected')
        OR NEW.pj_reviewed_at IS NULL
        OR (to_jsonb(NEW) - ARRAY['status','pj_review_decision','pj_review_note','pj_reviewed_at','action_deadline_at','history','updated_at'])
          IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['status','pj_review_decision','pj_review_note','pj_reviewed_at','action_deadline_at','history','updated_at']) THEN
        RAISE EXCEPTION 'Ação de revisão PJ inválida.';
      END IF;
  ELSIF v_role = 'suporte' THEN
      IF current_setting('app.support_appeal', true) IS DISTINCT FROM OLD.id::text
        OR OLD.status <> 'contestacao_negada' OR NEW.status <> 'aguardando_gestor_suporte'
        OR NEW.evaluated_id IS DISTINCT FROM v_caller THEN
        RAISE EXCEPTION 'Ação do atendente deve passar pela RPC de apelação.';
      END IF;
      IF (to_jsonb(NEW) - ARRAY['status','action_deadline_at','contestation_result','history','updated_at'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['status','action_deadline_at','contestation_result','history','updated_at']) THEN
        RAISE EXCEPTION 'Campos de monitoria não permitidos para atendente.';
      END IF;
  ELSIF v_role = 'gestor_suporte' THEN
    IF (to_jsonb(NEW) - ARRAY['status','action_deadline_at','resolution_type','corrective_action',
      'action_attachments','contestation_reason','contestation_result','history','updated_at',
      'pj_reviewer_id','pj_review_kind','pj_review_decision','pj_review_note','pj_reviewed_at'])
      IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['status','action_deadline_at','resolution_type','corrective_action',
      'action_attachments','contestation_reason','contestation_result','history','updated_at',
      'pj_reviewer_id','pj_review_kind','pj_review_decision','pj_review_note','pj_reviewed_at']) THEN
      RAISE EXCEPTION 'Campos de monitoria não permitidos para gestor de atendimento.';
    END IF;
    IF NOT ((OLD.status = 'pendente_revisao' AND NEW.status IN ('concluida','em_contestacao'))
      OR (OLD.status = 'pendente_revisao' AND NEW.status = 'aguardando_gestor_qualidade'
        AND current_setting('app.monitoria_support_decision', true) = OLD.id::text)
      OR (OLD.status = 'pendente_revisao' AND OLD.pj_review_required
        AND NEW.status = 'aguardando_gestor_qualidade'
        AND current_setting('app.pj_manager_action', true) = OLD.id::text)
      OR (OLD.status = 'aguardando_gestor_suporte' AND NEW.status IN
        ('concluida','em_contestacao','aguardando_gestor_qualidade','aguardando_revisao_pj'))
      OR NEW.status = OLD.status) THEN
      RAISE EXCEPTION 'Transição de status não permitida para gestor de atendimento.';
    END IF;
    IF NEW.history IS DISTINCT FROM OLD.history AND NOT (
      jsonb_typeof(NEW.history) = 'array'
      AND jsonb_array_length(NEW.history) = jsonb_array_length(coalesce(OLD.history,'[]'::jsonb)) + 1
      AND (NEW.history - (jsonb_array_length(NEW.history) - 1)) = coalesce(OLD.history,'[]'::jsonb)
      AND NEW.history->(jsonb_array_length(NEW.history) - 1)->>'by_id' = v_caller::text
    ) THEN RAISE EXCEPTION 'Histórico inválido.'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMIT;
