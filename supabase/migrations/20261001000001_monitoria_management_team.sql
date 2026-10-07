-- The ticket's Zendesk group describes where the work happened. The evaluated
-- agent's primary team owns the evaluation and its support-manager workflow.
BEGIN;

ALTER TABLE public.monitorias
  ADD COLUMN IF NOT EXISTS ticket_group_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- Keep the original ticket attribution before moving historical evaluations
-- to the evaluated agent's primary team.
UPDATE public.monitorias
SET ticket_group_team_id = team_id
WHERE ticket_group_team_id IS NULL;

UPDATE public.monitorias m
SET team_id = u.primary_team_id,
    team_name = t.name
FROM public.users u
JOIN public.teams t ON t.id = u.primary_team_id
WHERE m.evaluated_id = u.id
  AND u.primary_team_id IS NOT NULL
  AND m.team_id IS DISTINCT FROM u.primary_team_id;

CREATE OR REPLACE FUNCTION public.assign_monitoria_management_team()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_primary_team_id uuid; v_team_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.ticket_group_team_id := coalesce(NEW.ticket_group_team_id, NEW.team_id);
  ELSE
    NEW.ticket_group_team_id := coalesce(NEW.ticket_group_team_id, OLD.ticket_group_team_id, OLD.team_id);
  END IF;

  SELECT u.primary_team_id INTO v_primary_team_id
  FROM public.users u WHERE u.id = NEW.evaluated_id;
  NEW.team_id := coalesce(v_primary_team_id, NEW.ticket_group_team_id, NEW.team_id);
  SELECT t.name INTO v_team_name FROM public.teams t WHERE t.id = NEW.team_id;
  NEW.team_name := coalesce(v_team_name, NEW.team_name);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_monitoria_management_team() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assign_monitoria_management_team ON public.monitorias;
CREATE TRIGGER trg_assign_monitoria_management_team
BEFORE INSERT OR UPDATE OF evaluated_id, team_id, ticket_group_team_id
ON public.monitorias FOR EACH ROW EXECUTE FUNCTION public.assign_monitoria_management_team();

-- A change to the agent's primary team transfers the agent's evaluations to
-- the manager of the new team, including older evaluations.
CREATE OR REPLACE FUNCTION public.sync_monitoria_management_team()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.primary_team_id IS DISTINCT FROM OLD.primary_team_id THEN
    UPDATE public.monitorias m
    SET team_id = coalesce(NEW.primary_team_id, m.ticket_group_team_id),
        team_name = t.name
    FROM public.teams t
    WHERE m.evaluated_id = NEW.id
      AND t.id = coalesce(NEW.primary_team_id, m.ticket_group_team_id)
      AND m.team_id IS DISTINCT FROM t.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_monitoria_management_team() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_monitoria_management_team ON public.users;
CREATE TRIGGER trg_sync_monitoria_management_team
AFTER UPDATE OF primary_team_id ON public.users
FOR EACH ROW EXECUTE FUNCTION public.sync_monitoria_management_team();

-- Append the ticket group to the masked support view without exposing auditor
-- identity or changing its self-only access boundary.
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
  m.ticket_group_team_id
FROM public.monitorias m
WHERE m.evaluated_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.active AND u.role = 'suporte');

REVOKE ALL ON public.vw_monitorias_suporte FROM PUBLIC, anon;
GRANT SELECT ON public.vw_monitorias_suporte TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
