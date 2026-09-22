-- An invoker view cannot conceal columns that the same authenticated user can
-- select from the base table. Remove direct support reads/writes and make the
-- masked view the sole read boundary for that role.
DROP POLICY IF EXISTS "monitorias_select_policy" ON public.monitorias;
CREATE POLICY "monitorias_select_policy" ON public.monitorias FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.active
    AND (u.role IN ('admin', 'gestor_qualidade')
      OR (u.role = 'qualidade' AND monitorias.evaluator_id = (SELECT auth.uid()))
      OR (u.role = 'gestor_suporte' AND EXISTS (
        SELECT 1 FROM public.user_teams ut WHERE ut.user_id = u.id AND ut.team_id = monitorias.team_id))))
);

DROP POLICY IF EXISTS "monitorias_update_policy" ON public.monitorias;
CREATE POLICY "monitorias_update_policy" ON public.monitorias FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.active
    AND (u.role IN ('admin', 'gestor_qualidade')
      OR (u.role = 'qualidade' AND monitorias.evaluator_id = (SELECT auth.uid()))
      OR (u.role = 'gestor_suporte' AND EXISTS (
        SELECT 1 FROM public.user_teams ut WHERE ut.user_id = u.id AND ut.team_id = monitorias.team_id))))
);

DROP VIEW IF EXISTS public.vw_monitorias_suporte;
CREATE VIEW public.vw_monitorias_suporte WITH (security_invoker = false) AS
SELECT
  m.id, m.form_id, m.evaluated_id, m.evaluated_name, m.team_id, m.team_name, m.form_name,
  m.ticket_id, m.channel, m.ticket_date, m.analysis_date,
  m.satisfaction_result, m.satisfaction_has_record, m.satisfaction_record_text,
  m.answers, m.score, m.status, m.resolution_type, m.contestation_result,
  m.action_deadline_at, m.active, m.history, m.dissatisfaction_answers,
  m.created_at, m.updated_at, m.evaluator_note, m.question_observations,
  m.critical_error_observations, m.selected_critical_errors,
  m.client_contact_log, m.client_contact_success, m.client_contact_channel,
  m.form_snapshot, m.contestation_reason,
  NULL::uuid AS evaluator_id, NULL::text AS evaluator_name
FROM public.monitorias m
WHERE m.evaluated_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid())
    AND u.active AND u.role = 'suporte');
REVOKE ALL ON public.vw_monitorias_suporte FROM PUBLIC, anon;
GRANT SELECT ON public.vw_monitorias_suporte TO authenticated;

-- The only action exposed to an individual attendant is an appeal after the
-- quality manager rejected a contestation. Never accept arbitrary columns or
-- client-supplied history, status, identity or deadline.
CREATE OR REPLACE FUNCTION public.appeal_monitoria(p_monitoria_id UUID, p_note TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_row public.monitorias%ROWTYPE; v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = (SELECT auth.uid()) AND active FOR SHARE;
  IF v_user.id IS NULL OR v_user.role <> 'suporte' THEN RAISE EXCEPTION 'Apenas o atendente pode apelar.'; END IF;
  IF length(coalesce(p_note, '')) > 2000 THEN RAISE EXCEPTION 'Texto da apelação muito longo.'; END IF;
  SELECT * INTO v_row FROM public.monitorias WHERE id = p_monitoria_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.evaluated_id <> v_user.id OR NOT v_row.active
     OR v_row.status <> 'contestacao_negada' THEN
    RAISE EXCEPTION 'Monitoria indisponível para apelação.';
  END IF;
  PERFORM set_config('app.support_appeal', v_row.id::text, true);
  UPDATE public.monitorias SET
    status = 'aguardando_gestor_suporte',
    action_deadline_at = public.calculate_action_deadline(now(), 25),
    contestation_result = 'rejected',
    history = coalesce(v_row.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', 'Contestação mantida pelo Agente (enviado ao Gestor)',
      'by_id', v_user.id, 'by_name', v_user.name, 'at', now(), 'note', p_note)),
    updated_at = now()
  WHERE id = v_row.id;
END;
$$;
REVOKE ALL ON FUNCTION public.appeal_monitoria(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appeal_monitoria(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_monitoria_update_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role TEXT; v_caller UUID := (SELECT auth.uid());
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

  IF v_role = 'suporte' THEN
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
    IF (to_jsonb(NEW) - ARRAY['status','action_deadline_at','resolution_type','contestation_reason','contestation_result','history','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','action_deadline_at','resolution_type','contestation_reason','contestation_result','history','updated_at']) THEN
      RAISE EXCEPTION 'Campos de monitoria não permitidos para gestor de suporte.';
    END IF;
    IF NOT ((OLD.status = 'pendente_revisao' AND NEW.status IN ('concluida','em_contestacao'))
      OR (OLD.status = 'aguardando_gestor_suporte' AND NEW.status IN ('concluida','aguardando_gestor_qualidade'))
      OR NEW.status = OLD.status) THEN
      RAISE EXCEPTION 'Transição de status não permitida para gestor de suporte.';
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
NOTIFY pgrst, 'reload schema';
