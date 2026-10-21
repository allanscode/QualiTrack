-- Allow the Quality Manager decision flow to validate and retain its own
-- uploaded evidence. Also make contestation round detection independent of
-- accents in the leading word (including legacy double-encoded history).
BEGIN;

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
    RETURN (
      v_role = 'gestor_suporte'
      AND (
        v_row.score < 75
        OR (
          v_row.child_verdict = 'invalido'
          OR v_row.form_snapshot->>'child_verdict' = 'invalido'
        )
        AND (
          v_row.form_snapshot->>'ticket_kind' = 'chamado_filho'
          OR v_row.form_snapshot->>'automation' = 'child_ticket'
          OR v_row.form_id IN (
            '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
            '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
            '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
            '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
            '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
          )
        )
      )
      AND v_row.status IN ('pendente_revisao', 'aguardando_gestor_suporte')
      AND EXISTS (SELECT 1 FROM public.user_teams WHERE user_id = (SELECT auth.uid()) AND team_id = v_row.team_id)
    ) OR (
      v_role IN ('admin', 'gestor_qualidade')
      AND v_row.status = 'aguardando_gestor_qualidade'
    );
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
  v_attachment jsonb;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = (SELECT auth.uid()) AND active FOR SHARE;
  IF v_user.id IS NULL OR v_user.role NOT IN ('admin', 'gestor_qualidade') THEN
    RAISE EXCEPTION 'Apenas a Gestão da Qualidade pode decidir esta contestação.';
  END IF;

  SELECT * INTO v_row FROM public.monitorias WHERE id = p_monitoria_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT v_row.active OR v_row.status <> 'aguardando_gestor_qualidade' THEN
    RAISE EXCEPTION 'Esta avaliação não aguarda decisão da Qualidade.';
  END IF;
  IF length(v_note) > 2000 OR jsonb_typeof(p_attachments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Nota ou anexos inválidos para esta decisão.';
  END IF;
  IF jsonb_array_length(p_attachments) > 20 THEN
    RAISE EXCEPTION 'Nota ou anexos inválidos para esta decisão.';
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

  -- Match stable action fragments rather than the accented first word. The
  -- two phrases cover current support-manager events and legacy PJ escalations.
  SELECT count(*) INTO v_round
  FROM jsonb_array_elements(coalesce(v_row.history, '[]'::jsonb)) h
  WHERE lower(coalesce(h->>'action', '')) LIKE '%realizada pelo gestor de suporte%'
    OR lower(coalesce(h->>'action', '')) LIKE '%gestor pj encaminhou contesta%';

  IF p_action IS NULL OR p_action NOT IN ('aprovar', 'manter', 'invalidar')
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
    action_attachments = coalesce(action_attachments, '[]'::jsonb) || coalesce(p_attachments, '[]'::jsonb),
    history = coalesce(v_row.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', v_action, 'by_id', v_user.id, 'by_name', v_user.name,
      'at', now(), 'note', v_note, 'attachments', coalesce(p_attachments, '[]'::jsonb))),
    updated_at = now()
  WHERE id = v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.act_on_monitoria_as_quality_manager(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_monitoria_as_quality_manager(uuid, text, text, jsonb)
  TO authenticated;

-- A child-ticket evaluation has a binary verdict and NULL percentage score.
-- Treat a saved "invalido" verdict like a low score for support-manager review,
-- while allowing a stale pending row with a saved "valido" verdict to be
-- explicitly concluded. Normal monitorias retain the <75 score requirement.
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
  v_is_child boolean;
  v_child_verdict text;
  v_low_or_invalid boolean;
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
  IF p_action IS NULL OR p_action NOT IN ('aceitar', 'aprovar', 'contestar', 'escalar')
    OR v_note = '' OR length(v_note) > 2000 THEN
    RAISE EXCEPTION 'Decisão ou justificativa inválida.';
  END IF;
  IF jsonb_typeof(p_attachments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Lista de anexos inválida.';
  END IF;
  IF jsonb_array_length(p_attachments) > 20 THEN
    RAISE EXCEPTION 'Limite de anexos excedido.';
  END IF;

  v_is_child := v_row.form_id IN (
      '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
    )
    OR v_row.form_snapshot->>'ticket_kind' = 'chamado_filho'
    OR v_row.form_snapshot->>'automation' = 'child_ticket';
  v_child_verdict := coalesce(v_row.child_verdict, v_row.form_snapshot->>'child_verdict');
  v_low_or_invalid := (v_row.score < 75) IS TRUE
    OR (v_is_child AND v_child_verdict = 'invalido');

  -- A valid child can only be concluded; it cannot be contested or escalated.
  -- Invalid children remain on the low-score contest/review path.
  IF v_is_child AND (v_child_verdict IS NULL OR v_child_verdict NOT IN ('valido', 'invalido')) THEN
    RAISE EXCEPTION 'O veredito do chamado filho não está definido.';
  END IF;
  IF v_is_child AND v_child_verdict = 'valido' AND p_action NOT IN ('aceitar', 'aprovar') THEN
    RAISE EXCEPTION 'Um chamado filho válido só pode ser concluído.';
  END IF;
  IF NOT v_low_or_invalid AND NOT (v_is_child AND v_child_verdict = 'valido'
      AND p_action IN ('aceitar', 'aprovar')) THEN
    RAISE EXCEPTION 'Apenas avaliações abaixo de 75%% ou chamados filhos inválidos podem receber esta decisão.';
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
  WHERE lower(coalesce(h->>'action', '')) LIKE '%realizada pelo gestor de suporte%'
    OR lower(coalesce(h->>'action', '')) LIKE '%gestor pj encaminhou contesta%';
  v_conclude := p_action IN ('aceitar', 'aprovar');
  IF NOT v_conclude AND v_round >= 2 THEN
    RAISE EXCEPTION 'A segunda contestação já recebeu encaminhamento definitivo.';
  END IF;
  IF p_action = 'escalar' AND v_row.status <> 'aguardando_gestor_suporte' THEN
    RAISE EXCEPTION 'Apenas avaliações na etapa do Gestor de Suporte podem ser escaladas.';
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
    contestation_reason = CASE WHEN NOT v_conclude THEN v_note ELSE contestation_reason END,
    contestation_result = CASE WHEN v_conclude THEN
      CASE WHEN v_round > 0 THEN 'rejected' ELSE contestation_result END ELSE 'pending' END,
    pj_review_kind = CASE WHEN NOT v_conclude AND pj_review_required THEN 'contestation' ELSE pj_review_kind END,
    action_attachments = coalesce(action_attachments, '[]'::jsonb) || coalesce(p_attachments, '[]'::jsonb),
    history = coalesce(v_row.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'action', v_action, 'by_id', v_user.id, 'by_name', v_user.name,
      'at', now(), 'note', v_note, 'attachments', coalesce(p_attachments, '[]'::jsonb))),
    updated_at = now()
  WHERE id = v_row.id;
END;
$$;
REVOKE ALL ON FUNCTION public.act_on_monitoria_as_support_manager(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_monitoria_as_support_manager(uuid, text, text, jsonb)
  TO authenticated;

COMMIT;
