-- =================================================================
-- monitorias.client_contact_channel
--
-- A pergunta "Conseguimos contato com o cliente?" (Sim/Não) foi
-- removida do formulário: em pesquisa Negativa o monitor sempre
-- precisa tentar o contato (se não conseguir por telefone, envia
-- WhatsApp pelo Zendesk). O que passa a ser registrado é apenas o(s)
-- canal(is) usado(s) na tentativa.
--
-- client_contact_success/client_contact_log são mantidos (histórico
-- de monitorias antigas continua legível); client_contact_log segue
-- em uso para o texto livre do registro de contato.
-- =================================================================

ALTER TABLE public.monitorias
  ADD COLUMN IF NOT EXISTS client_contact_channel TEXT[] DEFAULT '{}';

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
  evaluator_note,
  question_observations,
  critical_error_observations,
  selected_critical_errors,
  client_contact_log,
  client_contact_success,
  client_contact_channel,
  form_snapshot,
  contestation_reason,
  NULL::uuid AS evaluator_id,
  NULL::text AS evaluator_name
FROM public.monitorias;

GRANT SELECT ON public.vw_monitorias_suporte TO authenticated;

NOTIFY pgrst, 'reload schema';
