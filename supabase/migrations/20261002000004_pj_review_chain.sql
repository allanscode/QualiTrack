-- PJ evaluations require a manager's request, Victor's review and a final
-- decision by Quality. The reviewer remains a support user with a scoped view.
BEGIN;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS requires_pj_review boolean NOT NULL DEFAULT false;
UPDATE public.teams SET requires_pj_review = true
WHERE kind = 'team' AND name IN ('PJ Bruno', 'PJ Duarte', 'PJ SumWise', 'PJ Trindade');
ALTER TABLE public.monitorias ADD COLUMN IF NOT EXISTS pj_review_required boolean NOT NULL DEFAULT false;
UPDATE public.monitorias m SET pj_review_required = true
FROM public.teams t WHERE t.id = m.team_id AND t.requires_pj_review;

CREATE TABLE IF NOT EXISTS public.pj_review_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  reviewer_id uuid NOT NULL REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pj_review_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.pj_review_settings TO authenticated;
DROP POLICY IF EXISTS pj_review_settings_select ON public.pj_review_settings;
CREATE POLICY pj_review_settings_select ON public.pj_review_settings FOR SELECT TO authenticated
  USING (_private.current_active_role() IN ('admin', 'gestor_qualidade'));
DROP POLICY IF EXISTS pj_review_settings_insert ON public.pj_review_settings;
CREATE POLICY pj_review_settings_insert ON public.pj_review_settings FOR INSERT TO authenticated
  WITH CHECK (_private.current_active_role() IN ('admin', 'gestor_qualidade'));
DROP POLICY IF EXISTS pj_review_settings_update ON public.pj_review_settings;
CREATE POLICY pj_review_settings_update ON public.pj_review_settings FOR UPDATE TO authenticated
  USING (_private.current_active_role() IN ('admin', 'gestor_qualidade'))
  WITH CHECK (_private.current_active_role() IN ('admin', 'gestor_qualidade'));

CREATE OR REPLACE FUNCTION public.validate_pj_reviewer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u
    WHERE u.id = NEW.reviewer_id AND u.active AND u.role = 'suporte') THEN
    RAISE EXCEPTION 'O revisor PJ deve ser um agente de suporte ativo.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_pj_reviewer() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validate_pj_reviewer ON public.pj_review_settings;
CREATE TRIGGER trg_validate_pj_reviewer BEFORE INSERT OR UPDATE OF reviewer_id
  ON public.pj_review_settings FOR EACH ROW EXECUTE FUNCTION public.validate_pj_reviewer();

INSERT INTO public.pj_review_settings (id, reviewer_id)
SELECT true, u.id FROM public.users u
WHERE lower(u.email) = 'victor.aguiar@webposto.com.br' AND u.active AND u.role = 'suporte'
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.teams WHERE requires_pj_review)
    AND NOT EXISTS (SELECT 1 FROM public.pj_review_settings) THEN
    RAISE EXCEPTION 'Victor Aguiar não está disponível como revisor PJ ativo.';
  END IF;
END;
$$;

ALTER TABLE public.monitorias
  ADD COLUMN IF NOT EXISTS pj_reviewer_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS pj_review_kind text CHECK (pj_review_kind IN ('approval', 'contestation')),
  ADD COLUMN IF NOT EXISTS pj_review_decision text CHECK (pj_review_decision IN ('approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS pj_review_note text,
  ADD COLUMN IF NOT EXISTS pj_reviewed_at timestamptz;

ALTER TABLE public.monitorias DROP CONSTRAINT IF EXISTS monitorias_status_check;
ALTER TABLE public.monitorias ADD CONSTRAINT monitorias_status_check CHECK (status IN (
  'pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte',
  'aguardando_revisao_pj', 'aguardando_gestor_qualidade', 'concluida',
  'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada',
  'reavaliacao_solicitada'
));
CREATE INDEX IF NOT EXISTS monitorias_pj_reviewer_queue_idx
  ON public.monitorias(pj_reviewer_id, status)
  WHERE pj_reviewer_id IS NOT NULL;

-- The existing support view remains self-only and keeps auditor identity masked.
-- The separate reviewer view exposes only cases assigned to that support user.
CREATE OR REPLACE VIEW public.vw_monitorias_suporte
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  m.id, m.form_id, m.evaluated_id, m.evaluated_name, m.team_id, m.team_name, m.form_name,
  m.ticket_id, m.channel, m.ticket_date, m.analysis_date,
  m.satisfaction_result, m.satisfaction_has_record, m.satisfaction_record_text,
  m.answers, m.score, m.status, m.resolution_type, m.contestation_result,
  m.action_deadline_at, m.active, _private.support_history(m.history, m.evaluated_id) AS history, m.dissatisfaction_answers,
  m.created_at, m.updated_at, m.evaluator_note, m.question_observations,
  m.critical_error_observations, m.selected_critical_errors,
  m.client_contact_log, m.client_contact_success, m.client_contact_channel,
  m.form_snapshot, m.contestation_reason, m.corrective_action, m.action_attachments,
  NULL::uuid AS evaluator_id, NULL::text AS evaluator_name,
  m.ticket_group_team_id, m.pj_reviewer_id, m.pj_review_kind,
  m.pj_review_decision, m.pj_review_note, m.pj_reviewed_at, m.pj_review_required
FROM public.monitorias m
WHERE m.evaluated_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.active AND u.role = 'suporte');
REVOKE ALL ON public.vw_monitorias_suporte FROM PUBLIC, anon;
GRANT SELECT ON public.vw_monitorias_suporte TO authenticated;

CREATE OR REPLACE VIEW public.vw_monitorias_pj_reviewer
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  m.id, m.form_id, m.evaluated_id, m.evaluated_name, m.team_id, m.team_name, m.form_name,
  m.ticket_id, m.channel, m.ticket_date, m.analysis_date,
  m.satisfaction_result, m.satisfaction_has_record, m.satisfaction_record_text,
  m.answers, m.score, m.status, m.resolution_type, m.contestation_result,
  m.action_deadline_at, m.active, _private.support_history(m.history, m.evaluated_id) AS history, m.dissatisfaction_answers,
  m.created_at, m.updated_at, m.evaluator_note, m.question_observations,
  m.critical_error_observations, m.selected_critical_errors,
  m.client_contact_log, m.client_contact_success, m.client_contact_channel,
  m.form_snapshot, m.contestation_reason, m.corrective_action, m.action_attachments,
  NULL::uuid AS evaluator_id, NULL::text AS evaluator_name,
  m.ticket_group_team_id, m.pj_reviewer_id, m.pj_review_kind,
  m.pj_review_decision, m.pj_review_note, m.pj_reviewed_at, m.pj_review_required
FROM public.monitorias m
WHERE m.pj_reviewer_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.active AND u.role = 'suporte');
REVOKE ALL ON public.vw_monitorias_pj_reviewer FROM PUBLIC, anon;
GRANT SELECT ON public.vw_monitorias_pj_reviewer TO authenticated;

-- Preserve the existing non-PJ RPC exactly, and put the PJ branch in front of
-- it. The renamed function is private to the wrapper.
ALTER FUNCTION public.act_on_monitoria_as_support_manager(uuid, text, text, jsonb)
  RENAME TO act_on_monitoria_as_support_manager_standard;
REVOKE ALL ON FUNCTION public.act_on_monitoria_as_support_manager_standard(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.act_on_monitoria_as_support_manager(
  p_monitoria_id uuid, p_action text, p_note text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_row public.monitorias%ROWTYPE;
  v_reviewer_id uuid;
  v_reviewer_name text;
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

  SELECT s.reviewer_id, u.name INTO v_reviewer_id, v_reviewer_name FROM public.pj_review_settings s
  JOIN public.users u ON u.id = s.reviewer_id AND u.active AND u.role = 'suporte'
  WHERE s.id = true;
  IF v_reviewer_id IS NULL THEN RAISE EXCEPTION 'Revisor PJ não está configurado ou ativo.'; END IF;

  v_kind := CASE WHEN p_action IN ('contestar', 'escalar') THEN 'contestation' ELSE 'approval' END;
  v_description := CASE WHEN v_kind = 'contestation'
    THEN 'Gestor PJ encaminhou contestação para ' || v_reviewer_name
    ELSE 'Gestor PJ encaminhou aprovação para ' || v_reviewer_name END;
  SELECT config INTO v_config FROM public.quality_configs WHERE active ORDER BY updated_at DESC LIMIT 1;
  v_hours := coalesce((v_config->'action_deadline'->>'manager_support')::numeric, 25);

  PERFORM set_config('app.pj_manager_action', v_row.id::text, true);
  UPDATE public.monitorias SET
    status = 'aguardando_revisao_pj',
    pj_reviewer_id = v_reviewer_id,
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

CREATE OR REPLACE FUNCTION public.review_pj_monitoria(
  p_monitoria_id uuid, p_decision text, p_note text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_row public.monitorias%ROWTYPE;
  v_config jsonb;
  v_hours numeric;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = (SELECT auth.uid()) AND active FOR SHARE;
  IF v_user.id IS NULL OR v_user.role <> 'suporte' THEN
    RAISE EXCEPTION 'Apenas o revisor PJ designado pode decidir.';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected')
    OR trim(coalesce(p_note, '')) = '' OR length(p_note) > 2000 THEN
    RAISE EXCEPTION 'Informe uma decisão e justificativa válida.';
  END IF;
  SELECT * INTO v_row FROM public.monitorias WHERE id = p_monitoria_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT v_row.active
    OR v_row.status <> 'aguardando_revisao_pj'
    OR v_row.pj_reviewer_id IS DISTINCT FROM v_user.id
    OR NOT v_row.pj_review_required THEN
    RAISE EXCEPTION 'Monitoria não está na fila deste revisor.';
  END IF;
  SELECT config INTO v_config FROM public.quality_configs WHERE active ORDER BY updated_at DESC LIMIT 1;
  v_hours := coalesce((v_config->'action_deadline'->>'manager_quality')::numeric, 25);
  PERFORM set_config('app.pj_reviewer_action', v_row.id::text, true);
  UPDATE public.monitorias SET
    status = 'aguardando_gestor_qualidade',
    pj_review_decision = p_decision,
    pj_review_note = trim(p_note),
    pj_reviewed_at = now(),
    action_deadline_at = public.calculate_action_deadline(now(), v_hours),
    history = coalesce(v_row.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', v_user.name || CASE WHEN p_decision = 'approved'
        THEN ' aprovou o parecer PJ'
        ELSE ' reprovou o parecer PJ' END,
      'by_id', v_user.id, 'by_name', v_user.name, 'at', now(), 'note', trim(p_note))),
    updated_at = now()
  WHERE id = v_row.id;
END;
$$;
REVOKE ALL ON FUNCTION public.review_pj_monitoria(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_pj_monitoria(uuid, text, text) TO authenticated;

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

  IF v_role = 'suporte' THEN
    IF current_setting('app.pj_reviewer_action', true) = OLD.id::text THEN
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
    ELSE
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
    IF NOT ((OLD.status = 'pendente_revisao' AND NEW.status IN ('concluida','em_contestacao','aguardando_revisao_pj'))
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

CREATE OR REPLACE FUNCTION public.enforce_pj_review_route()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_is_pj boolean;
BEGIN
  SELECT coalesce(t.requires_pj_review, false) INTO v_is_pj
  FROM public.teams t WHERE t.id = NEW.team_id;
  IF TG_OP = 'INSERT' THEN
    NEW.pj_review_required := coalesce(v_is_pj, false);
    IF NOT NEW.pj_review_required THEN RETURN NEW; END IF;
    IF NEW.status <> 'pendente_revisao' THEN
      RAISE EXCEPTION 'Monitorias PJ devem começar na revisão do gestor PJ.';
    END IF;
    IF NEW.pj_reviewer_id IS NOT NULL OR NEW.pj_review_kind IS NOT NULL
      OR NEW.pj_review_decision IS NOT NULL OR NEW.pj_review_note IS NOT NULL
      OR NEW.pj_reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'O parecer PJ não pode ser pré-preenchido.';
    END IF;
    RETURN NEW;
  END IF;
  NEW.pj_review_required := OLD.pj_review_required OR coalesce(v_is_pj, false);
  IF NOT NEW.pj_review_required THEN RETURN NEW; END IF;

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
DROP TRIGGER IF EXISTS trg_enforce_pj_review_route ON public.monitorias;
CREATE TRIGGER trg_enforce_pj_review_route BEFORE INSERT OR UPDATE
  ON public.monitorias FOR EACH ROW EXECUTE FUNCTION public.enforce_pj_review_route();

-- A missed deadline must not finalize PJ work before either human decision.
-- Keep the deadline visible and overdue until the assigned person acts.
CREATE OR REPLACE FUNCTION public.process_action_deadline_timeouts()
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE item record; quality_turn boolean;
BEGIN
  FOR item IN SELECT m.id,m.status,m.score FROM public.monitorias m
    WHERE m.active AND m.action_deadline_at < now()
      AND m.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada',
        'pendente_revisao','aguardando_gestor_suporte','contestacao_negada')
      AND NOT m.pj_review_required
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    quality_turn := item.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada');
    UPDATE public.monitorias SET status = 'concluida',
      score = CASE WHEN quality_turn THEN 100 ELSE item.score END,
      resolution_type = 'automatic', concluded_at = now(), updated_at = now(),
      history = coalesce(history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action','Finalização Automática (Prazo)', 'by_id','system', 'by_name','Sistema Automático', 'at',now(),
        'note',CASE WHEN quality_turn THEN 'Monitoria aprovada automaticamente (nota 100%) por perda de prazo da Equipe de Qualidade.'
          ELSE 'Monitoria aprovada automaticamente por perda de prazo da Equipe de Suporte.' END))
    WHERE id = item.id;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.process_action_deadline_timeouts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_action_deadline_timeouts() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
