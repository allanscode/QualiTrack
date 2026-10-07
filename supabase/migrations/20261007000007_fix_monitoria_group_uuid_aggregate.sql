-- PostgreSQL has no min(uuid) aggregate. Resolve an unambiguous management
-- team through text aggregation, preserving NULL for unmapped/shared groups.
BEGIN;
CREATE OR REPLACE FUNCTION public.assign_monitoria_management_team()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_primary_team_id uuid; v_candidate uuid; v_kind text; v_team_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ticket_group_team_id IS NULL AND EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = NEW.team_id AND (kind = 'group' OR zendesk_group_id IS NOT NULL)
    ) THEN
      NEW.ticket_group_team_id := NEW.team_id;
    END IF;
  ELSE
    NEW.ticket_group_team_id := coalesce(NEW.ticket_group_team_id, OLD.ticket_group_team_id);
  END IF;
  SELECT u.primary_team_id INTO v_primary_team_id
  FROM public.users u WHERE u.id = NEW.evaluated_id;
  v_candidate := coalesce(v_primary_team_id, NEW.team_id, NEW.ticket_group_team_id);
  SELECT t.kind INTO v_kind FROM public.teams t WHERE t.id = v_candidate;
  IF v_kind = 'group' THEN
    SELECT CASE WHEN count(*) = 1 THEN min(team_id::text)::uuid ELSE NULL END
      INTO v_candidate FROM public.team_groups WHERE group_id = v_candidate;
  ELSIF v_kind IS NULL THEN
    v_candidate := NULL;
  END IF;
  NEW.team_id := v_candidate;
  SELECT t.name INTO v_team_name FROM public.teams t WHERE t.id = NEW.team_id;
  NEW.team_name := v_team_name;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_monitoria_management_team() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
