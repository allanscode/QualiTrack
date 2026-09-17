BEGIN;
CREATE SCHEMA IF NOT EXISTS _private;
REVOKE ALL ON SCHEMA _private FROM public, anon;
GRANT USAGE ON SCHEMA _private TO authenticated;

CREATE OR REPLACE FUNCTION _private.current_active_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.users WHERE id = (SELECT auth.uid()) AND active = true;
$$;
CREATE OR REPLACE FUNCTION _private.own_team_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT team_id FROM public.user_teams WHERE user_id = (SELECT auth.uid())
    AND _private.current_active_role() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION _private.current_active_role(), _private.own_team_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION _private.current_active_role(), _private.own_team_ids() TO authenticated;

DROP POLICY IF EXISTS security_users_read ON public.users;
CREATE POLICY security_users_read ON public.users AS RESTRICTIVE FOR SELECT TO authenticated USING (
  id = (SELECT auth.uid())
  OR _private.current_active_role() IN ('admin','gestor_qualidade','qualidade')
  OR (_private.current_active_role() = 'gestor_suporte' AND id IN (
    SELECT user_id FROM public.user_teams WHERE team_id IN (SELECT _private.own_team_ids())
  ))
);

-- RESTRICTIVE also limits legacy permissive FOR ALL policies.
DROP POLICY IF EXISTS security_user_teams_read ON public.user_teams;
CREATE POLICY security_user_teams_read ON public.user_teams AS RESTRICTIVE FOR SELECT TO authenticated USING (
  _private.current_active_role() IS NOT NULL AND (
    user_id = (SELECT auth.uid())
    OR _private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade')
    OR (_private.current_active_role() = 'gestor_suporte' AND team_id IN (SELECT _private.own_team_ids()))
  )
);
-- Membership grants access to evaluations: only an active admin may change it.
DROP POLICY IF EXISTS security_user_teams_insert ON public.user_teams;
CREATE POLICY security_user_teams_insert ON public.user_teams AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (_private.is_admin());
DROP POLICY IF EXISTS security_user_teams_update ON public.user_teams;
CREATE POLICY security_user_teams_update ON public.user_teams AS RESTRICTIVE FOR UPDATE TO authenticated USING (_private.is_admin()) WITH CHECK (_private.is_admin());
DROP POLICY IF EXISTS security_user_teams_delete ON public.user_teams;
CREATE POLICY security_user_teams_delete ON public.user_teams AS RESTRICTIVE FOR DELETE TO authenticated USING (_private.is_admin());

DROP POLICY IF EXISTS security_teams_read ON public.teams;
CREATE POLICY security_teams_read ON public.teams AS RESTRICTIVE FOR SELECT TO authenticated USING (
  _private.current_active_role() IN ('admin','gestor_qualidade','qualidade') OR id IN (SELECT _private.own_team_ids())
);
-- Forms and criteria are needed to display historical evaluations, including
-- snapshots from prior teams. Keep metadata readable to active staff, not dormant accounts.
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['forms','form_teams','dissatisfaction_fields','quality_configs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS security_active_read ON public.%I', tbl);
    EXECUTE format('CREATE POLICY security_active_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (_private.current_active_role() IS NOT NULL)', tbl);
  END LOOP;
END $$;

-- All public requests go through the validated/rate-limited Edge Function.
REVOKE INSERT ON public.access_requests FROM anon, authenticated;
DROP POLICY IF EXISTS access_requests_insert ON public.access_requests;
DROP POLICY IF EXISTS access_requests_authenticated_insert ON public.access_requests;

CREATE TABLE IF NOT EXISTS _private.security_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);
REVOKE ALL ON _private.security_rate_limits FROM public, anon, authenticated;
ALTER TABLE _private.security_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_security_rate_limit(bucket_key text, max_requests integer, window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE used integer; moment timestamptz := clock_timestamp();
BEGIN
  IF bucket_key IS NULL OR length(bucket_key) > 200 OR max_requests < 1 OR window_seconds < 1 OR window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;
  -- Bounded retention; serialized atomic upsert across Edge Function instances.
  DELETE FROM _private.security_rate_limits WHERE window_start < moment - interval '1 day';
  INSERT INTO _private.security_rate_limits AS limits (bucket, window_start, attempts)
  VALUES (bucket_key, moment, 1)
  ON CONFLICT (bucket) DO UPDATE SET
    attempts = CASE WHEN limits.window_start <= moment - make_interval(secs => window_seconds) THEN 1 ELSE least(limits.attempts + 1, max_requests + 1) END,
    window_start = CASE WHEN limits.window_start <= moment - make_interval(secs => window_seconds) THEN moment ELSE limits.window_start END
  RETURNING attempts INTO used;
  RETURN used <= max_requests;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_security_rate_limit(text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_security_rate_limit(text, integer, integer) TO service_role;
COMMIT;
BEGIN;
-- Never grant admin by email or client-controlled Auth metadata.
-- New users are activated explicitly by the administrative invite workflow.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE provisional public.users%ROWTYPE;
BEGIN
  SELECT * INTO provisional FROM public.users
    WHERE lower(email) = lower(NEW.email) AND is_provisional = true AND id <> NEW.id
    FOR UPDATE;
  IF provisional.id IS NOT NULL THEN
    -- Free the unique email within this transaction, insert the target BEFORE
    -- changing foreign keys, and remove the provisional record only at the end.
    UPDATE public.users SET email = provisional.id::text || '@migration.invalid' WHERE id = provisional.id;
  END IF;
  INSERT INTO public.users (id, email, name, role, primary_team_id, active, must_change_password, created_at, external_id, source_system, is_provisional)
  VALUES (NEW.id, lower(NEW.email), COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'suporte', provisional.primary_team_id, false, true, COALESCE(NEW.created_at, now()), provisional.external_id, provisional.source_system, false)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  IF provisional.id IS NOT NULL THEN
    UPDATE public.monitorias SET evaluated_id = NEW.id WHERE evaluated_id = provisional.id;
    UPDATE public.monitorias SET evaluator_id = NEW.id WHERE evaluator_id = provisional.id;
    UPDATE public.forms SET created_by = NEW.id WHERE created_by = provisional.id;
    UPDATE public.helpdesk_submissions SET created_by = NEW.id WHERE created_by = provisional.id;
    UPDATE public.ai_evaluation_guidelines SET created_by = NEW.id WHERE created_by = provisional.id;
    UPDATE public.ai_evaluation_drafts SET created_by = NEW.id WHERE created_by = provisional.id;
    UPDATE public.ai_evaluation_drafts SET agent_id = NEW.id WHERE agent_id = provisional.id;
    INSERT INTO public.user_teams (user_id, team_id)
      SELECT NEW.id, team_id FROM public.user_teams WHERE user_id = provisional.id
      ON CONFLICT (user_id, team_id) DO NOTHING;
    INSERT INTO public.user_preferences (user_id, preferences)
      SELECT NEW.id, preferences FROM public.user_preferences WHERE user_id = provisional.id
      ON CONFLICT (user_id) DO NOTHING;
    DELETE FROM public.users WHERE id = provisional.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
COMMIT;
-- =================================================================
-- 20260917000001_monitorias_update_integrity_and_anonymity.sql
--
-- 1. Integridade de UPDATE em monitorias:
--    Impede que o papel 'suporte' ou terceiros alterem notas (score),
--    respostas, erros críticos, ou pulem etapas de status por chamada
--    direta à API Supabase/PostgREST.
--
-- 2. Anonimato Estrito do Auditor:
--    Garante que a role 'suporte' não consiga inspecionar evaluator_id
--    ou evaluator_name diretamente na tabela public.monitorias.
--    Consultas de 'suporte' passam exclusivamente por vw_monitorias_suporte.
-- =================================================================

-- 1. Trigger de Integridade para UPDATE em monitorias
CREATE OR REPLACE FUNCTION public.enforce_monitoria_update_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role text;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();

  -- Se executado sem contexto JWT autenticado (ex.: trigger interna, service_role ou superuser), permite
  IF v_caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtém o papel ativo do usuário autenticado chamador
  SELECT role INTO v_caller_role
  FROM public.users
  WHERE id = v_caller_id AND active = true;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário inativo ou não autenticado.';
  END IF;

  -- Regra global 1: Evaluator e Evaluated não podem ser alterados após definidos
  IF NEW.evaluator_id IS DISTINCT FROM OLD.evaluator_id AND OLD.evaluator_id IS NOT NULL THEN
    RAISE EXCEPTION 'Não é permitido alterar o auditor responsável (evaluator_id).';
  END IF;

  IF NEW.evaluated_id IS DISTINCT FROM OLD.evaluated_id AND OLD.evaluated_id IS NOT NULL THEN
    -- Permite migração de conta provisória para conta formal (disparada pelo trigger handle_new_user)
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = OLD.evaluated_id AND is_provisional = true) THEN
      RAISE EXCEPTION 'Não é permitido alterar o atendente avaliado (evaluated_id).';
    END IF;
  END IF;

  IF NEW.ticket_id IS DISTINCT FROM OLD.ticket_id AND OLD.ticket_id IS NOT NULL THEN
    RAISE EXCEPTION 'Não é permitido alterar o ticket associado à monitoria.';
  END IF;

  IF NEW.form_id IS DISTINCT FROM OLD.form_id AND v_caller_role NOT IN ('admin', 'gestor_qualidade') THEN
    RAISE EXCEPTION 'Apenas administradores e gestores de qualidade podem alterar o formulário de uma monitoria.';
  END IF;

  -- Regra global 2: Monitoria já excluída/inativa não pode ser alterada por não-admins
  IF OLD.active = false AND v_caller_role NOT IN ('admin', 'gestor_qualidade') THEN
    RAISE EXCEPTION 'Não é permitido alterar uma monitoria inativa/excluída.';
  END IF;

  -- Regras estritas para papel 'suporte' (Atendente avaliado)
  IF v_caller_role = 'suporte' THEN
    -- Suporte nunca pode alterar nota, respostas de critérios ou erros críticos
    IF NEW.score IS DISTINCT FROM OLD.score THEN
      RAISE EXCEPTION 'Atendentes não têm permissão para alterar nota (score).';
    END IF;

    IF NEW.answers IS DISTINCT FROM OLD.answers THEN
      RAISE EXCEPTION 'Atendentes não têm permissão para alterar respostas de critérios.';
    END IF;

    IF NEW.selected_critical_errors IS DISTINCT FROM OLD.selected_critical_errors THEN
      RAISE EXCEPTION 'Atendentes não têm permissão para alterar erros críticos.';
    END IF;

    IF NEW.active IS DISTINCT FROM OLD.active THEN
      RAISE EXCEPTION 'Atendentes não têm permissão para excluir ou desativar monitorias.';
    END IF;

    IF NEW.evaluator_note IS DISTINCT FROM OLD.evaluator_note THEN
      RAISE EXCEPTION 'Atendentes não têm permissão para alterar observações do auditor.';
    END IF;

    -- Transições de status permitidas para suporte:
    -- Pode apenas contestar (pendente_revisao -> em_contestacao)
    -- Ou aceitar/concluir (pendente_revisao -> concluida)
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        OLD.status = 'pendente_revisao' AND NEW.status IN ('em_contestacao', 'concluida')
      ) THEN
        RAISE EXCEPTION 'Transição de status não permitida para o perfil suporte (% -> %).', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;

  -- Regras para 'gestor_suporte'
  IF v_caller_role = 'gestor_suporte' THEN
    IF NEW.score IS DISTINCT FROM OLD.score THEN
      RAISE EXCEPTION 'Gestores de suporte não têm permissão para alterar notas de avaliação diretamente.';
    END IF;

    IF NEW.answers IS DISTINCT FROM OLD.answers THEN
      RAISE EXCEPTION 'Gestores de suporte não têm permissão para alterar respostas de critérios.';
    END IF;

    IF NEW.active IS DISTINCT FROM OLD.active AND v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'Gestores de suporte não têm permissão para excluir monitorias.';
    END IF;
  END IF;

  -- Atualiza o timestamp de alteração
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_monitoria_update_integrity ON public.monitorias;
CREATE TRIGGER trg_monitoria_update_integrity
  BEFORE UPDATE ON public.monitorias
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_monitoria_update_integrity();

-- 2. Reforço de Anonimato na View de Suporte
DROP VIEW IF EXISTS public.vw_monitorias_suporte;
CREATE OR REPLACE VIEW public.vw_monitorias_suporte
  WITH (security_invoker = false) AS
SELECT
  m.id,
  m.form_id,
  m.evaluated_id,
  m.evaluated_name,
  m.team_id,
  m.team_name,
  m.form_name,
  m.ticket_id,
  m.channel,
  m.ticket_date,
  m.analysis_date,
  m.satisfaction_result,
  m.satisfaction_has_record,
  m.satisfaction_record_text,
  m.answers,
  m.score,
  m.status,
  m.resolution_type,
  m.contestation_result,
  m.action_deadline_at,
  m.active,
  m.history,
  m.dissatisfaction_answers,
  m.created_at,
  m.updated_at,
  NULL::uuid AS evaluator_id,
  'Auditor Qualidade'::text AS evaluator_name
FROM public.monitorias m
WHERE (
  -- Se for suporte, vê apenas suas próprias monitorias ou de suas equipes
  m.evaluated_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_teams ut
    WHERE ut.user_id = (SELECT auth.uid())
      AND ut.team_id = m.team_id
  )
  -- Perfis de gestão/qualidade/admin mantêm visibilidade total se consultarem a view
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.active = true
      AND u.role IN ('admin', 'gestor_qualidade', 'qualidade', 'gestor_suporte')
  )
);

GRANT SELECT ON public.vw_monitorias_suporte TO authenticated;

NOTIFY pgrst, 'reload schema';
