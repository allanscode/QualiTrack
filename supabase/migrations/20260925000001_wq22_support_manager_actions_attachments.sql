-- Migration WQ-22: Regras de aprovação/contestação do gestor de suporte,
-- colunas de ação corretiva e anexos, e bucket de armazenamento privado.

ALTER TABLE public.monitorias
  ADD COLUMN IF NOT EXISTS corrective_action TEXT,
  ADD COLUMN IF NOT EXISTS action_attachments JSONB DEFAULT '[]'::jsonb;

-- Atualizar view de suporte mascarada para expor as novas colunas preservando anonimato
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
  m.form_snapshot, m.contestation_reason, m.corrective_action, m.action_attachments,
  NULL::uuid AS evaluator_id, NULL::text AS evaluator_name
FROM public.monitorias m
WHERE m.evaluated_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid())
    AND u.active AND u.role = 'suporte');

REVOKE ALL ON public.vw_monitorias_suporte FROM PUBLIC, anon;
GRANT SELECT ON public.vw_monitorias_suporte TO authenticated;

-- RPC atualizada com validação server-side de Ação Corretiva e Justificativa da Contestação
DROP FUNCTION IF EXISTS public.act_on_monitoria_as_support_manager(UUID, TEXT, TEXT);

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

-- Bucket de Storage privado para anexos de evidências/ações corretivas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'monitoria-attachments',
  'monitoria-attachments',
  false,
  15728640,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "monitoria_attachments_select" ON storage.objects;
CREATE POLICY "monitoria_attachments_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'monitoria-attachments'
  );

DROP POLICY IF EXISTS "monitoria_attachments_insert" ON storage.objects;
CREATE POLICY "monitoria_attachments_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'monitoria-attachments'
  );

NOTIFY pgrst, 'reload schema';
