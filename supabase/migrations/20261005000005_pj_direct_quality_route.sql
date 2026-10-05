-- PJ manager approval and contestation now go directly to Quality.
-- The retired reviewer stage remains in the status type for historical rows.
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
REVOKE ALL ON FUNCTION public.enforce_pj_review_route() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.act_on_monitoria_as_support_manager(
  p_monitoria_id uuid, p_action text, p_note text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_row public.monitorias%ROWTYPE;
  v_config jsonb;
  v_hours numeric;
  v_kind text;
  v_description text;
  v_note text := trim(coalesce(p_note, ''));
  v_attachment jsonb;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = (SELECT auth.uid()) AND active FOR SHARE;
  IF v_user.id IS NULL OR v_user.role <> 'gestor_suporte' THEN
    RAISE EXCEPTION 'Apenas gestor de atendimento pode executar esta ação.';
  END IF;
  SELECT * INTO v_row FROM public.monitorias WHERE id = p_monitoria_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT v_row.active OR NOT EXISTS (
    SELECT 1 FROM public.user_teams ut WHERE ut.user_id = v_user.id AND ut.team_id = v_row.team_id
  ) THEN
    RAISE EXCEPTION 'Monitoria indisponível para este gestor.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.teams t WHERE t.id = v_row.team_id
    AND t.approval_manager_id IS NOT NULL AND t.approval_manager_id <> v_user.id) THEN
    RAISE EXCEPTION 'Esta equipe possui outro gestor designado para as aprovações.';
  END IF;
  IF NOT v_row.pj_review_required THEN
    PERFORM public.act_on_monitoria_as_support_manager_standard(
      p_monitoria_id, p_action, p_note, p_attachments);
    RETURN;
  END IF;

  IF length(coalesce(p_note, '')) > 2000 THEN RAISE EXCEPTION 'Nota muito longa.'; END IF;
  IF jsonb_typeof(p_attachments) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_attachments) > 20 THEN
    RAISE EXCEPTION 'Anexos inválidos.';
  END IF;
  FOR v_attachment IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
    IF jsonb_typeof(v_attachment) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_attachment->'path') IS DISTINCT FROM 'string'
      OR split_part(v_attachment->>'path', '/', 2) IS DISTINCT FROM v_row.id::text
      OR NOT coalesce(_private.can_access_monitoria_attachment(v_attachment->>'path', true), false)
      OR v_attachment ? 'url'
      OR NOT EXISTS (SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'monitoria-attachments' AND o.name = v_attachment->>'path') THEN
      RAISE EXCEPTION 'Anexo indisponível para esta monitoria.';
    END IF;
  END LOOP;

  IF p_action = 'contestar'
    AND (v_row.score < 75) IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas monitorias com nota inferior a 75 permitem esta ação.';
  END IF;
  IF v_row.status NOT IN ('pendente_revisao', 'aguardando_gestor_suporte')
    OR p_action NOT IN ('aprovar', 'aceitar', 'contestar', 'escalar')
    OR (p_action = 'escalar' AND v_row.status <> 'aguardando_gestor_suporte') THEN
    RAISE EXCEPTION 'Transição de status não permitida.';
  END IF;
  IF p_action IN ('aprovar', 'aceitar', 'contestar') AND v_note = '' THEN
    RAISE EXCEPTION 'Ação corretiva ou justificativa é obrigatória para o parecer PJ.';
  END IF;

  v_kind := CASE WHEN p_action IN ('contestar', 'escalar') THEN 'contestation' ELSE 'approval' END;
  v_description := CASE WHEN v_kind = 'contestation'
    THEN 'Gestor PJ encaminhou contestação para a Gestão da Qualidade'
    ELSE 'Gestor PJ encaminhou aprovação para a Gestão da Qualidade' END;
  SELECT config INTO v_config FROM public.quality_configs WHERE active ORDER BY updated_at DESC LIMIT 1;
  v_hours := coalesce((v_config->'action_deadline'->>'manager_quality')::numeric, 25);

  PERFORM set_config('app.pj_manager_action', v_row.id::text, true);
  UPDATE public.monitorias SET
    status = 'aguardando_gestor_qualidade',
    pj_reviewer_id = NULL,
    pj_review_kind = v_kind,
    pj_review_decision = NULL,
    pj_review_note = NULL,
    pj_reviewed_at = NULL,
    action_deadline_at = public.calculate_action_deadline(now(), v_hours),
    corrective_action = CASE WHEN v_kind = 'approval' THEN p_note ELSE corrective_action END,
    contestation_reason = CASE WHEN v_kind = 'contestation' THEN p_note ELSE contestation_reason END,
    contestation_result = CASE WHEN v_kind = 'contestation' THEN 'pending' ELSE contestation_result END,
    action_attachments = coalesce(action_attachments, '[]'::jsonb) || p_attachments,
    history = coalesce(v_row.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', v_description, 'by_id', v_user.id, 'by_name', v_user.name,
      'at', now(), 'note', p_note, 'attachments', p_attachments)),
    updated_at = now()
  WHERE id = v_row.id;
END;
$$;
REVOKE ALL ON FUNCTION public.act_on_monitoria_as_support_manager(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_monitoria_as_support_manager(uuid, text, text, jsonb)
  TO authenticated;

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
REVOKE ALL ON FUNCTION public.enforce_monitoria_update_integrity() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.review_pj_monitoria(
  p_monitoria_id uuid, p_decision text, p_note text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'A revisão de Victor foi encerrada; pareceres PJ seguem diretamente à Gestão da Qualidade.';
END;
$$;
REVOKE ALL ON FUNCTION public.review_pj_monitoria(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_pj_monitoria(uuid, text, text) TO authenticated;

-- No active cases were in this stage when the rule changed, but preserve a
-- safe upgrade path if another environment still has pending reviewer work.
UPDATE public.monitorias m SET
  status = 'aguardando_gestor_qualidade',
  pj_reviewer_id = NULL,
  action_deadline_at = public.calculate_action_deadline(now(), coalesce((
    SELECT (qc.config->'action_deadline'->>'manager_quality')::numeric
    FROM public.quality_configs qc WHERE qc.active ORDER BY qc.updated_at DESC LIMIT 1
  ), 25)),
  history = coalesce(m.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'action', 'Parecer PJ encaminhado diretamente à Gestão da Qualidade',
    'by_id', NULL, 'by_name', 'Sistema', 'at', now(),
    'note', 'A etapa de revisão de Victor foi encerrada.')),
  updated_at = now()
WHERE m.active AND m.pj_review_required AND m.status = 'aguardando_revisao_pj';

NOTIFY pgrst, 'reload schema';
COMMIT;
