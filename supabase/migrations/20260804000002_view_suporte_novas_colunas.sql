-- =================================================================
-- vw_monitorias_suporte — inclui as colunas adicionadas em monitorias
--
-- A view lista colunas explicitamente e foi criada antes de
-- 20260804000001 adicionar 9 colunas novas. Consequência: o agente de
-- suporte (único papel que consulta esta view) recebia a monitoria sem
-- evaluator_note nem question_observations — ou seja, sem as
-- observações da qualidade sobre o próprio atendimento. A tela exibia
-- "Nenhuma observação registrada", indistinguível de um auditor que
-- realmente não comentou nada.
--
-- Anonimato preservado: evaluator_id e evaluator_name continuam NULL,
-- que é a razão de a view existir. O que passa a ser exposto é o
-- conteúdo do feedback, não a identidade de quem avaliou.
--
-- applied_config fica de fora de propósito: é configuração interna de
-- pesos e metas, sem utilidade para o avaliado.
-- =================================================================

DROP VIEW IF EXISTS public.vw_monitorias_suporte;

CREATE VIEW public.vw_monitorias_suporte
  WITH (security_invoker = on) AS
SELECT
  id, form_id, evaluated_id, evaluated_name, team_id, team_name, form_name,
  ticket_id, channel, ticket_date, analysis_date,
  satisfaction_result, satisfaction_has_record, satisfaction_record_text,
  answers, score, status, resolution_type, contestation_result,
  action_deadline_at, active, history, dissatisfaction_answers,
  created_at, updated_at,
  -- Colunas adicionadas em 20260804000001
  evaluator_note,
  question_observations,
  critical_error_observations,
  selected_critical_errors,
  client_contact_log,
  client_contact_success,
  form_snapshot,
  contestation_reason,
  -- Anonimização do auditor (motivo de existir desta view)
  NULL::uuid AS evaluator_id,
  NULL::text AS evaluator_name
FROM public.monitorias;

GRANT SELECT ON public.vw_monitorias_suporte TO authenticated;

NOTIFY pgrst, 'reload schema';
