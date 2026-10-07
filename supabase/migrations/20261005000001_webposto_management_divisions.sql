-- WebPosto management divisions stay separate from Zendesk ticket groups.
-- Zendesk memberships and the profile field "vinculado_a_equipe" checked on
-- 2026-10-05 provide the initial roster. Unclassified agents stay in WebPosto.
BEGIN;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS approval_manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_team_approval_manager()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.approval_manager_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.user_teams ut ON ut.user_id = u.id AND ut.team_id = NEW.id
    WHERE u.id = NEW.approval_manager_id AND u.active AND u.role = 'gestor_suporte'
  ) THEN
    RAISE EXCEPTION 'O gestor aprovador deve estar ativo e vinculado à equipe.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_team_approval_manager() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validate_team_approval_manager ON public.teams;
CREATE TRIGGER trg_validate_team_approval_manager BEFORE INSERT OR UPDATE OF approval_manager_id
  ON public.teams FOR EACH ROW EXECUTE FUNCTION public.validate_team_approval_manager();

CREATE OR REPLACE FUNCTION public.clear_removed_team_approval_manager()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.teams SET approval_manager_id = NULL
  WHERE id = OLD.team_id AND approval_manager_id = OLD.user_id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_removed_team_approval_manager() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_clear_removed_team_approval_manager ON public.user_teams;
CREATE TRIGGER trg_clear_removed_team_approval_manager AFTER DELETE
  ON public.user_teams FOR EACH ROW EXECUTE FUNCTION public.clear_removed_team_approval_manager();

DO $migration$
DECLARE
  v_web uuid;
  v_final uuid;
  v_revenda uuid;
  v_escala uuid;
  v_pagamentos uuid;
  v_pj_bruno uuid;
  v_pj_trindade uuid;
  v_ana uuid;
  v_ricardo uuid;
  v_victor uuid;
  v_agent_id uuid;
  v_division text;
  v_target uuid;
BEGIN
  -- A previous admin rename left the published WebPosto root named
  -- "Cliente final". Keep its ID, 49 agents, group links and monitorias.
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE kind = 'team' AND name = 'WebPosto')
    AND NOT EXISTS (SELECT 1 FROM public.teams WHERE kind = 'team' AND lower(name) = 'cliente final' AND parent_team_id IS NULL) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE kind = 'team' AND name = 'WebPosto') THEN
    UPDATE public.teams SET name = 'WebPosto', sigla = 'WEB',
      description = 'Equipe principal de atendimento CLT da WebPosto'
    WHERE kind = 'team' AND lower(name) = 'cliente final' AND parent_team_id IS NULL;
  END IF;
  SELECT id INTO STRICT v_web FROM public.teams WHERE kind = 'team' AND name = 'WebPosto';
  UPDATE public.monitorias SET team_name = 'WebPosto'
  WHERE team_id = v_web AND team_name IS DISTINCT FROM 'WebPosto';

  IF EXISTS (SELECT 1 FROM public.teams WHERE kind = 'team' AND name IN ('Cliente Final', 'Revenda', 'Escala')
    AND parent_team_id IS DISTINCT FROM v_web) THEN
    RAISE EXCEPTION 'As divisões Cliente Final/Revenda já existem fora da WebPosto';
  END IF;

  INSERT INTO public.teams (name, sigla, description, icon, kind, active, parent_team_id)
  SELECT 'Cliente Final', 'WCF', 'Gestão dos atendentes CLT de Cliente Final', 'Users', 'team', true, v_web
  WHERE NOT EXISTS (SELECT 1 FROM public.teams WHERE kind = 'team' AND name = 'Cliente Final');
  INSERT INTO public.teams (name, sigla, description, icon, kind, active, parent_team_id)
  SELECT 'Revenda', 'WRV', 'Gestão dos atendentes CLT de Revenda', 'Users', 'team', true, v_web
  WHERE NOT EXISTS (SELECT 1 FROM public.teams WHERE kind = 'team' AND name = 'Revenda');
  INSERT INTO public.teams (name, sigla, description, icon, kind, active, parent_team_id)
  SELECT 'Escala', 'WES', 'Gestão dos atendentes CLT da escala compartilhada', 'Users', 'team', true, v_web
  WHERE NOT EXISTS (SELECT 1 FROM public.teams WHERE kind = 'team' AND name = 'Escala');
  SELECT id INTO STRICT v_final FROM public.teams WHERE kind = 'team' AND name = 'Cliente Final' AND parent_team_id = v_web;
  SELECT id INTO STRICT v_revenda FROM public.teams WHERE kind = 'team' AND name = 'Revenda' AND parent_team_id = v_web;
  SELECT id INTO STRICT v_escala FROM public.teams WHERE kind = 'team' AND name = 'Escala' AND parent_team_id = v_web;
  SELECT id INTO STRICT v_pagamentos FROM public.teams WHERE kind = 'team' AND name = 'Mais Pagamentos' AND parent_team_id = v_web;
  SELECT id INTO STRICT v_pj_bruno FROM public.teams WHERE kind = 'team' AND name = 'PJ Bruno';
  SELECT id INTO STRICT v_pj_trindade FROM public.teams WHERE kind = 'team' AND name = 'PJ Trindade';

  -- Zendesk groups can serve several CLT divisions and PJ teams. Seed links
  -- from the actual agent memberships; admins can adjust them in the panel.
  INSERT INTO public.team_groups (team_id, group_id)
  SELECT destination.id, g.id
  FROM public.teams g
  CROSS JOIN (VALUES (v_final), (v_revenda), (v_escala)) AS destination(id)
  WHERE g.kind = 'group' AND (
    g.name ILIKE '%Cliente Final%' OR g.name ILIKE '%Revenda%'
    OR (destination.id = v_final AND (g.name ILIKE '%Cliente Sul%' OR g.name IN ('Escala - TEF', 'Gestão', 'Mais Pagamentos - Escala')))
    OR (destination.id = v_revenda AND g.name IN ('Escala - TEF', 'Mais Pagamentos - Escala', 'Webside'))
    OR (destination.id = v_escala AND (g.name ILIKE '%Escala%' OR g.name IN ('TEF', 'Plantão')))
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO STRICT v_ana FROM public.users
    WHERE active AND role = 'gestor_suporte' AND name ILIKE 'Ana Karolina%';
  SELECT id INTO STRICT v_ricardo FROM public.users
    WHERE active AND role = 'gestor_suporte' AND name ILIKE 'Ricardo Fadini%';
  SELECT id INTO STRICT v_victor FROM public.users
    WHERE active AND lower(email) = 'victor.aguiar@webposto.com.br'
      AND role IN ('suporte', 'gestor_suporte');

  IF NOT EXISTS (SELECT 1 FROM public.pj_review_settings WHERE id AND reviewer_id = v_victor) THEN
    RAISE EXCEPTION 'Victor deve permanecer como revisor PJ antes da mudança de equipe';
  END IF;

  -- Team access follows explicit membership. Remove only the three named
  -- managers from the broad WebPosto team, leaving all agents untouched.
  UPDATE public.users SET role = 'gestor_suporte' WHERE id = v_victor;
  UPDATE public.users SET primary_team_id = v_final WHERE id IN (v_ana, v_ricardo);
  UPDATE public.users SET primary_team_id = v_revenda WHERE id = v_victor;
  DELETE FROM public.user_teams WHERE team_id = v_web AND user_id IN (v_ana, v_ricardo, v_victor);
  INSERT INTO public.user_teams (user_id, team_id)
  VALUES (v_ana, v_final), (v_ricardo, v_final), (v_victor, v_revenda), (v_victor, v_escala)
  ON CONFLICT DO NOTHING;
  UPDATE public.teams SET approval_manager_id = v_victor WHERE id = v_revenda;
  UPDATE public.teams SET approval_manager_id = v_victor WHERE id = v_escala;

  -- Snapshot of the read-only Zendesk membership and profile report. Only
  -- active support agents still assigned to the WebPosto root move here.
  -- Ticket groups stay independent; existing PJ assignments are preserved.
  FOR v_agent_id, v_division IN
    SELECT roster.user_id, roster.division FROM (VALUES
      ('b8aaa9c7-4675-465d-b4af-a2bbaa4d3a61'::uuid, 'final'),
      ('d4d08dae-5250-4f2b-98b6-0ca84ad7cf09'::uuid, 'final'),
      ('2aca2e04-cc5a-4335-955b-c34f0d2a0d6e'::uuid, 'final'),
      ('07ede458-a2c7-451f-a988-fd787f306c76'::uuid, 'final'),
      ('b131e6c9-4d9d-4d46-89a5-58d889029c68'::uuid, 'final'),
      ('245442f0-79e8-4d61-8c94-a83da019828b'::uuid, 'final'),
      ('a229813c-e2c0-4e60-9125-ce3dea146ff2'::uuid, 'final'),
      ('6c19510f-83d8-4b62-9a89-7c6232a8446b'::uuid, 'final'),
      ('61e2598f-a700-4d5e-91ab-34ae1ee7fe0f'::uuid, 'final'),
      ('35ce5dc5-6316-4e45-832c-cd96a572af6f'::uuid, 'final'),
      ('576290a7-8e62-48f7-9463-1afa8ad64602'::uuid, 'final'),
      ('60b1afcc-e552-455e-b9e4-09b4c8d6f75f'::uuid, 'final'),
      ('fa6ff6e1-4b82-4839-832c-5de321d11b48'::uuid, 'final'),
      ('5cde19c7-b518-4f57-96fb-9484e9baad50'::uuid, 'final'),
      ('5b027ef1-c9cf-4407-abcb-dcb6b14fad80'::uuid, 'final'),
      ('2c9cd196-5862-4830-af86-3abeb6b4c008'::uuid, 'final'),
      ('60ebd468-6f70-486a-861d-4092f4660f8e'::uuid, 'final'),
      ('062b1864-f5ff-44d7-bd4a-6d20094d448a'::uuid, 'final'),
      ('7aeca8dc-66af-4e46-92db-8dcc064cd990'::uuid, 'revenda'),
      ('86ef4cfd-5d93-41ef-bd9b-70d36a139ef4'::uuid, 'revenda'),
      ('689decc5-dd89-481a-bef3-a428f19011d4'::uuid, 'revenda'),
      ('b8af40a1-f0df-4e40-aeb4-ab893ed36bd3'::uuid, 'revenda'),
      ('1dbdc2b1-19c0-4485-9bbb-7265606c363b'::uuid, 'revenda'),
      ('643d2351-5b86-40df-8cac-77d1bea28995'::uuid, 'revenda'),
      ('57b0e77d-64b2-4543-9163-df863a5db1df'::uuid, 'revenda'),
      ('5f270304-beee-444c-bedf-df89f2426554'::uuid, 'revenda'),
      ('25816791-333b-4f07-9523-ee4520540ec9'::uuid, 'revenda'),
      ('5c31f6e5-9b30-47c1-b417-cdfcbcf72fae'::uuid, 'revenda'),
      ('8f87992d-2e74-4c10-8230-e4cdfbc81d04'::uuid, 'revenda'),
      ('7068bda3-937d-468a-a198-1ec63bf8b370'::uuid, 'revenda'),
      ('c300edbf-a2d8-404e-8c1b-0c0f22658193'::uuid, 'revenda'),
      ('38325a23-2714-484f-9808-e53bcf3cd9f2'::uuid, 'revenda'),
      ('ebeb78a0-28dd-4b11-8feb-ed2df75ce550'::uuid, 'revenda'),
      ('2e4863ed-6543-483f-a5de-afc764cfa2dc'::uuid, 'revenda'),
      ('a4470337-cba2-4876-9417-1eaf99adca89'::uuid, 'revenda'),
      ('4fb853f3-b916-4242-a568-0bb175a8f19b'::uuid, 'revenda'),
      ('005b1126-99a6-4607-9248-308cbdcf3260'::uuid, 'revenda'),
      ('44324429-e016-4dd9-982c-136ce65f290b'::uuid, 'revenda'),
      ('045dad4a-90e2-4ba3-912f-def26c5b2c93'::uuid, 'escala'),
      ('03a863c3-340f-46dd-bd0e-953884382bd1'::uuid, 'escala'),
      ('ec586b68-312b-434b-8423-f78e71dd8059'::uuid, 'escala'),
      ('f5404a67-9a0e-4bcc-8c25-61bade7d49da'::uuid, 'escala'),
      ('c926496d-5a28-454b-9ac3-fea591283fac'::uuid, 'escala'),
      ('9415ae42-bc48-4b02-9d15-445043c84eda'::uuid, 'pagamentos'),
      ('cf09bf40-30e3-48e3-ba1c-50298b7b754a'::uuid, 'pj_bruno'),
      ('ab7f39c1-93ff-4edd-a7e8-ccff4eb53fdd'::uuid, 'pj_trindade')
    ) AS roster(user_id, division)
  LOOP
    v_target := CASE v_division
      WHEN 'final' THEN v_final
      WHEN 'revenda' THEN v_revenda
      WHEN 'escala' THEN v_escala
      WHEN 'pagamentos' THEN v_pagamentos
      WHEN 'pj_bruno' THEN v_pj_bruno
      WHEN 'pj_trindade' THEN v_pj_trindade
    END;
    UPDATE public.users SET primary_team_id = v_target
    WHERE id = v_agent_id AND active AND role = 'suporte' AND primary_team_id = v_web;
    IF FOUND THEN
      DELETE FROM public.user_teams WHERE user_id = v_agent_id AND team_id = v_web;
      INSERT INTO public.user_teams (user_id, team_id) VALUES (v_agent_id, v_target)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$migration$;

-- Reviewer functions and view below preserve Victor's PJ reviewer duty after
-- his promotion to the Revenda management role.
CREATE OR REPLACE FUNCTION public.validate_pj_reviewer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u
    WHERE u.id = NEW.reviewer_id AND u.active AND u.role IN ('suporte', 'gestor_suporte')) THEN
    RAISE EXCEPTION 'O revisor PJ deve ser um atendente ou gestor de atendimento ativo.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_pj_reviewer() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validate_pj_reviewer ON public.pj_review_settings;
CREATE TRIGGER trg_validate_pj_reviewer BEFORE INSERT OR UPDATE OF reviewer_id
  ON public.pj_review_settings FOR EACH ROW EXECUTE FUNCTION public.validate_pj_reviewer();

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
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.active AND u.role IN ('suporte', 'gestor_suporte'));
REVOKE ALL ON public.vw_monitorias_pj_reviewer FROM PUBLIC, anon;
GRANT SELECT ON public.vw_monitorias_pj_reviewer TO authenticated;

CREATE OR REPLACE FUNCTION public.act_on_monitoria_as_support_manager(
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

  SELECT s.reviewer_id, u.name INTO v_reviewer_id, v_reviewer_name FROM public.pj_review_settings s
  JOIN public.users u ON u.id = s.reviewer_id AND u.active AND u.role IN ('suporte', 'gestor_suporte')
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
  IF v_user.id IS NULL OR v_user.role NOT IN ('suporte', 'gestor_suporte') THEN
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

NOTIFY pgrst, 'reload schema';
COMMIT;
