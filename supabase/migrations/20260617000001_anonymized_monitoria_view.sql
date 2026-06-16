-- =================================================================
-- Create an anonymized view of monitorias for suporte role
-- Hides evaluator_id and evaluator_name to preserve auditor anonymity
-- =================================================================

-- Drop existing view if recreating
DROP VIEW IF EXISTS public.vw_monitorias_suporte;

-- Create view with evaluator fields as NULL (anonymized)
CREATE OR REPLACE VIEW public.vw_monitorias_suporte AS
SELECT
  id, form_id, evaluated_id, evaluated_name, team_id, team_name, form_name,
  ticket_id, channel, ticket_date, analysis_date,
  satisfaction_result, satisfaction_has_record, satisfaction_record_text,
  answers, score, status, resolution_type, contestation_result,
  action_deadline_at, active, history, dissatisfaction_answers,
  created_at, updated_at,
  NULL::uuid AS evaluator_id,
  NULL::text AS evaluator_name
FROM public.monitorias;

-- Grant access to authenticated users
GRANT SELECT ON public.vw_monitorias_suporte TO authenticated;
