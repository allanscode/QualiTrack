-- WQ-22 corrective migration. Keep the deployed migration immutable.
-- Rollback: roll forward with a corrected policy/function; never restore the
-- old bucket-wide grants. No application data or stored objects are deleted.
BEGIN;

CREATE SCHEMA IF NOT EXISTS _private;
GRANT USAGE ON SCHEMA _private TO authenticated;

-- Match the existing frontend path: monitorias/<monitoria UUID>/<filename>.
-- Definer access is necessary because support cannot SELECT the base table.
-- Return only a boolean, never an evaluation or its auditor's identity.
CREATE OR REPLACE FUNCTION _private.can_access_monitoria_attachment(p_path text, p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_id uuid; v_role text; v_row public.monitorias%ROWTYPE;
BEGIN
  IF p_path IS NULL OR p_path !~ '^monitorias/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[a-zA-Z0-9._-]+$'
    OR split_part(p_path, '/', 3) IN ('.', '..') THEN RETURN false; END IF;
  v_id := split_part(p_path, '/', 2)::uuid;
  SELECT role INTO v_role FROM public.users WHERE id = (SELECT auth.uid()) AND active;
  IF v_role IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_row FROM public.monitorias WHERE id = v_id AND active;
  IF v_row.id IS NULL THEN RETURN false; END IF;

  IF p_write THEN
    -- The upload UI is part of the support-manager approval/contestation flow.
    RETURN v_role = 'gestor_suporte' AND v_row.score < 75
      AND v_row.status IN ('pendente_revisao', 'aguardando_gestor_suporte')
      AND EXISTS (SELECT 1 FROM public.user_teams WHERE user_id = (SELECT auth.uid()) AND team_id = v_row.team_id);
  END IF;
  RETURN v_role IN ('admin', 'gestor_qualidade')
    OR (v_role = 'qualidade' AND v_row.evaluator_id = (SELECT auth.uid()))
    OR (v_role = 'suporte' AND v_row.evaluated_id = (SELECT auth.uid()))
    OR (v_role = 'gestor_suporte' AND EXISTS (
      SELECT 1 FROM public.user_teams WHERE user_id = (SELECT auth.uid()) AND team_id = v_row.team_id));
END;
$$;
REVOKE ALL ON FUNCTION _private.can_access_monitoria_attachment(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION _private.can_access_monitoria_attachment(text, boolean) TO authenticated;

-- Force private even if the existing bucket was manually made public.
UPDATE storage.buckets SET public = false WHERE id = 'monitoria-attachments';
DROP POLICY IF EXISTS monitoria_attachments_select ON storage.objects;
CREATE POLICY monitoria_attachments_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'monitoria-attachments' AND _private.can_access_monitoria_attachment(name, false));
DROP POLICY IF EXISTS monitoria_attachments_insert ON storage.objects;
CREATE POLICY monitoria_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'monitoria-attachments' AND _private.can_access_monitoria_attachment(name, true));

-- Restrictive guards also defeat an unrelated permissive FOR ALL policy.
-- Other buckets keep their existing policies. Objects are immutable to browsers.
DROP POLICY IF EXISTS monitoria_attachments_read_guard ON storage.objects;
CREATE POLICY monitoria_attachments_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'monitoria-attachments' OR _private.can_access_monitoria_attachment(name, false));
DROP POLICY IF EXISTS monitoria_attachments_insert_guard ON storage.objects;
CREATE POLICY monitoria_attachments_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'monitoria-attachments' OR _private.can_access_monitoria_attachment(name, true));
DROP POLICY IF EXISTS monitoria_attachments_update_guard ON storage.objects;
CREATE POLICY monitoria_attachments_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'monitoria-attachments') WITH CHECK (bucket_id <> 'monitoria-attachments');
DROP POLICY IF EXISTS monitoria_attachments_delete_guard ON storage.objects;
CREATE POLICY monitoria_attachments_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'monitoria-attachments');
DROP POLICY IF EXISTS monitoria_attachments_anon_guard ON storage.objects;
CREATE POLICY monitoria_attachments_anon_guard ON storage.objects AS RESTRICTIVE FOR ALL TO anon
  USING (bucket_id <> 'monitoria-attachments') WITH CHECK (bucket_id <> 'monitoria-attachments');

-- The 20260922000019 boundary deliberately denies support SELECT on monitorias.
-- An invoker view on that table would return zero rows; granting base access
-- would disclose evaluator_id/name. Preserve the definer view's self-only filter
-- and mask structured actor identity in history as well as top-level identity.
CREATE OR REPLACE FUNCTION _private.support_history(p_history jsonb, p_self uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = 'public' AS $$
  SELECT coalesce(jsonb_agg(
    CASE WHEN entry->>'by_id' = p_self::text THEN entry
      ELSE (entry - 'by_id' - 'by_name') || jsonb_build_object('by_id', NULL, 'by_name', 'Equipe responsável') END
    ORDER BY position), '[]'::jsonb)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_history) = 'array' THEN p_history ELSE '[]'::jsonb END)
    WITH ORDINALITY AS events(entry, position);
$$;
REVOKE ALL ON FUNCTION _private.support_history(jsonb, uuid) FROM PUBLIC, anon, authenticated;
-- Invoking a view still requires EXECUTE on its scalar functions. This helper
-- only transforms its arguments and cannot read application data.
GRANT EXECUTE ON FUNCTION _private.support_history(jsonb, uuid) TO authenticated;

CREATE OR REPLACE VIEW public.vw_monitorias_suporte WITH (security_invoker = false, security_barrier = true) AS
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
  NULL::uuid AS evaluator_id, NULL::text AS evaluator_name
FROM public.monitorias m
WHERE m.evaluated_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.active AND u.role = 'suporte');
REVOKE ALL ON public.vw_monitorias_suporte FROM PUBLIC, anon;
GRANT SELECT ON public.vw_monitorias_suporte TO authenticated;

CREATE OR REPLACE FUNCTION public.act_on_monitoria_as_support_manager(
  p_monitoria_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL,
  p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_row public.monitorias%ROWTYPE;
  v_status TEXT;
  v_description TEXT;
  v_hours NUMERIC;
  v_config JSONB;
  v_clean_note TEXT;
  v_attachment JSONB;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = (SELECT auth.uid()) AND active FOR SHARE;
  IF v_user.id IS NULL OR v_user.role <> 'gestor_suporte' THEN
    RAISE EXCEPTION 'Apenas gestor de suporte pode executar esta ação.';
  END IF;

  IF length(coalesce(p_note, '')) > 2000 THEN
    RAISE EXCEPTION 'Nota muito longa.';
  END IF;

  SELECT * INTO v_row FROM public.monitorias WHERE id = p_monitoria_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT v_row.active OR NOT EXISTS (
    SELECT 1 FROM public.user_teams ut WHERE ut.user_id = v_user.id AND ut.team_id = v_row.team_id
  ) THEN
    RAISE EXCEPTION 'Monitoria indisponível para este gestor.';
  END IF;

  -- NULL and PostgreSQL numeric NaN must also fail the score gate.
  IF p_action IN ('aprovar', 'aceitar', 'contestar') AND (v_row.score < 75) IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas monitorias com nota inferior a 75 permitem esta a??o.';
  END IF;
  IF jsonb_typeof(p_attachments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Anexos devem ser uma lista.';
  END IF;
  IF jsonb_array_length(p_attachments) > 20 THEN
    RAISE EXCEPTION 'Limite de anexos excedido.';
  END IF;
  FOR v_attachment IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
    IF jsonb_typeof(v_attachment) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_attachment->'path') IS DISTINCT FROM 'string'
      OR split_part(v_attachment->>'path', '/', 2) IS DISTINCT FROM v_row.id::text
      OR NOT coalesce(_private.can_access_monitoria_attachment(v_attachment->>'path', true), false)
      OR v_attachment ? 'url'
      OR NOT EXISTS (SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'monitoria-attachments' AND o.name = v_attachment->>'path') THEN
      RAISE EXCEPTION 'Anexo indispon?vel para esta monitoria.';
    END IF;
  END LOOP;

  v_clean_note := trim(coalesce(p_note, ''));

  -- Validação estrita das regras de negócio do gestor de suporte:
  -- Aprovar requer Ação Corretiva obrigatória
  IF (v_row.status IN ('pendente_revisao', 'aguardando_gestor_suporte')) AND (p_action IN ('aprovar', 'aceitar')) THEN
    IF v_clean_note = '' THEN
      RAISE EXCEPTION 'Ação Corretiva é obrigatória para aprovação pelo gestor de suporte.';
    END IF;
    v_status := 'concluida';
    v_description := 'Monitoria aprovada pelo Gestor de Suporte';

  -- Contestar requer Justificativa da Contestação obrigatória
  ELSIF (v_row.status IN ('pendente_revisao', 'aguardando_gestor_suporte')) AND (p_action = 'contestar') THEN
    IF v_clean_note = '' THEN
      RAISE EXCEPTION 'Justificativa da Contestação é obrigatória para contestar.';
    END IF;
    v_status := 'em_contestacao';
    v_description := 'Contestação realizada pelo Gestor de Suporte';

  ELSIF v_row.status = 'aguardando_gestor_suporte' AND p_action = 'escalar' THEN
    v_status := 'aguardando_gestor_qualidade';
    v_description := 'Escalado para decisão da Qualidade';

  ELSE
    RAISE EXCEPTION 'Transição de status não permitida.';
  END IF;

  SELECT config INTO v_config FROM public.quality_configs WHERE active ORDER BY updated_at DESC LIMIT 1;
  v_hours := CASE v_status
    WHEN 'em_contestacao' THEN coalesce((v_config->'action_deadline'->>'auditor_reevaluation')::NUMERIC, 25)
    WHEN 'aguardando_gestor_qualidade' THEN coalesce((v_config->'action_deadline'->>'manager_quality')::NUMERIC, 25)
    ELSE NULL END;

  UPDATE public.monitorias SET
    status = v_status,
    action_deadline_at = CASE WHEN v_hours IS NULL THEN NULL
      ELSE public.calculate_action_deadline(now(), v_hours) END,
    resolution_type = CASE WHEN v_status = 'concluida' THEN 'human' ELSE resolution_type END,
    corrective_action = CASE WHEN p_action IN ('aprovar', 'aceitar') THEN p_note ELSE corrective_action END,
    contestation_reason = CASE WHEN p_action = 'contestar' THEN p_note ELSE contestation_reason END,
    contestation_result = CASE WHEN p_action IN ('aceitar','aprovar') THEN 'approved' ELSE contestation_result END,
    action_attachments = coalesce(action_attachments, '[]'::jsonb) || coalesce(p_attachments, '[]'::jsonb),
    history = coalesce(v_row.history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', v_description,
      'by_id', v_user.id,
      'by_name', v_user.name,
      'at', now(),
      'note', p_note,
      'attachments', coalesce(p_attachments, '[]'::jsonb)
    )),
    updated_at = now()
  WHERE id = v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.act_on_monitoria_as_support_manager(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_monitoria_as_support_manager(UUID, TEXT, TEXT, JSONB) TO authenticated;


-- Preserve integrity checks while admitting the new RPC-owned columns.
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
    IF (to_jsonb(NEW) - ARRAY['status','action_deadline_at','resolution_type','corrective_action','action_attachments','contestation_reason','contestation_result','history','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','action_deadline_at','resolution_type','corrective_action','action_attachments','contestation_reason','contestation_result','history','updated_at']) THEN
      RAISE EXCEPTION 'Campos de monitoria não permitidos para gestor de suporte.';
    END IF;
    IF NOT ((OLD.status = 'pendente_revisao' AND NEW.status IN ('concluida','em_contestacao'))
      OR (OLD.status = 'aguardando_gestor_suporte' AND NEW.status IN ('concluida','em_contestacao','aguardando_gestor_qualidade'))
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
COMMIT;
