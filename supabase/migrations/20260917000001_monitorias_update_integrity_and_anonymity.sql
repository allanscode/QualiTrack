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
