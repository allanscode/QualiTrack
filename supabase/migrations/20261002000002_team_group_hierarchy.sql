-- Teams own agents and evaluations. Zendesk groups describe ticket origin.
-- A group can serve several teams; an agent's primary team owns the audit.
BEGIN;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS zendesk_group_id bigint;
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_kind_check;
ALTER TABLE public.teams ADD CONSTRAINT teams_kind_check CHECK (kind IN ('team', 'group'));
CREATE UNIQUE INDEX IF NOT EXISTS teams_zendesk_group_id_unique
  ON public.teams(zendesk_group_id) WHERE zendesk_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_unsafe_team_conversion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.kind = 'team' AND NEW.kind = 'group' AND (
    EXISTS (SELECT 1 FROM public.user_teams WHERE team_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.users WHERE primary_team_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.monitorias WHERE team_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.form_teams WHERE team_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.forms WHERE team_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.agent_feedbacks WHERE team_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.team_groups WHERE team_id = OLD.id)
  ) THEN
    RAISE EXCEPTION 'Use a conversão de grupo para transferir os vínculos existentes';
  END IF;
  IF OLD.kind = 'group' AND NEW.kind = 'team' THEN
    RAISE EXCEPTION 'A reversão de grupo para equipe exige migração de dados';
  END IF;
  IF OLD.active AND NOT NEW.active AND NEW.kind = 'team'
     AND EXISTS (SELECT 1 FROM public.team_groups WHERE team_id = OLD.id) THEN
    RAISE EXCEPTION 'Remova os grupos vinculados antes de desativar a equipe';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_unsafe_team_conversion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_prevent_unsafe_team_conversion ON public.teams;
CREATE TRIGGER trg_prevent_unsafe_team_conversion BEFORE UPDATE OF kind, active ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.prevent_unsafe_team_conversion();

CREATE OR REPLACE FUNCTION public.ensure_person_has_real_team()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_team_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'user_teams' THEN
    v_team_id := NEW.team_id;
  ELSE
    v_team_id := NEW.primary_team_id;
  END IF;
  IF v_team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = v_team_id AND t.kind = 'team'
  ) THEN
    RAISE EXCEPTION 'Pessoas só podem ser vinculadas a equipes, não a grupos de tickets';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_person_has_real_team() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_ensure_user_team_is_real ON public.user_teams;
CREATE TRIGGER trg_ensure_user_team_is_real BEFORE INSERT OR UPDATE OF team_id ON public.user_teams
FOR EACH ROW EXECUTE FUNCTION public.ensure_person_has_real_team();
DROP TRIGGER IF EXISTS trg_ensure_primary_team_is_real ON public.users;
CREATE TRIGGER trg_ensure_primary_team_is_real BEFORE INSERT OR UPDATE OF primary_team_id ON public.users
FOR EACH ROW EXECUTE FUNCTION public.ensure_person_has_real_team();

CREATE TABLE IF NOT EXISTS public.team_groups (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, group_id),
  CHECK (team_id <> group_id)
);
CREATE INDEX IF NOT EXISTS team_groups_group_idx ON public.team_groups(group_id);
ALTER TABLE public.team_groups ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_groups TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_team_group_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = NEW.team_id AND t.kind = 'team' AND t.active)
     OR NOT EXISTS (SELECT 1 FROM public.teams g WHERE g.id = NEW.group_id AND g.kind = 'group') THEN
    RAISE EXCEPTION 'O vínculo exige uma equipe ativa e um grupo';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_team_group_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validate_team_group_link ON public.team_groups;
CREATE TRIGGER trg_validate_team_group_link BEFORE INSERT OR UPDATE ON public.team_groups
FOR EACH ROW EXECUTE FUNCTION public.validate_team_group_link();

CREATE POLICY team_groups_read ON public.team_groups FOR SELECT TO authenticated USING (
  _private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade')
  OR team_id IN (SELECT _private.own_team_ids())
);
CREATE POLICY team_groups_write ON public.team_groups FOR ALL TO authenticated
  USING (_private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade'))
  WITH CHECK (_private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade'));

DROP POLICY IF EXISTS security_teams_read ON public.teams;
CREATE POLICY security_teams_read ON public.teams AS RESTRICTIVE FOR SELECT TO authenticated USING (
  _private.current_active_role() IN ('admin', 'gestor_qualidade', 'qualidade')
  OR id IN (SELECT _private.own_team_ids())
  OR (kind = 'group' AND EXISTS (
    SELECT 1 FROM public.team_groups tg
    WHERE tg.group_id = teams.id AND tg.team_id IN (SELECT _private.own_team_ids())
  ))
);

-- Existing rows matching Zendesk groups stay teams until explicitly
-- converted. People must first be assigned to their real teams; this
-- transaction then distributes historical audits by each agent's primary
-- team and preserves the group's ID on historical tickets.
CREATE OR REPLACE FUNCTION public.convert_team_to_group(p_group_id uuid, p_destination_team_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_group public.teams%ROWTYPE; v_destination public.teams%ROWTYPE;
BEGIN
  IF coalesce(_private.current_active_role(), '') NOT IN ('admin', 'gestor_qualidade', 'qualidade') THEN
    RAISE EXCEPTION 'Sem permissão para converter grupos';
  END IF;
  SELECT * INTO v_group FROM public.teams WHERE id = p_group_id FOR UPDATE;
  SELECT * INTO v_destination FROM public.teams WHERE id = p_destination_team_id FOR UPDATE;
  IF v_group.id IS NULL OR v_group.kind <> 'team'
     OR v_destination.id IS NULL OR v_destination.kind <> 'team' OR NOT v_destination.active
     OR p_group_id = p_destination_team_id THEN
    RAISE EXCEPTION 'Selecione um grupo antigo e uma equipe ativa diferente';
  END IF;
  IF v_group.zendesk_group_id IS NULL THEN
    RAISE EXCEPTION 'Sincronize o grupo do Zendesk antes da conversão';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE primary_team_id = p_group_id) THEN
    RAISE EXCEPTION 'Defina a equipe principal das pessoas antes de converter o grupo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_teams old_link
    JOIN public.users u ON u.id = old_link.user_id
    WHERE old_link.team_id = p_group_id
      AND u.active AND u.role IN ('suporte', 'gestor_suporte')
      AND NOT EXISTS (
        SELECT 1 FROM public.user_teams other_link JOIN public.teams t ON t.id = other_link.team_id
        WHERE other_link.user_id = u.id AND t.kind = 'team' AND t.id <> p_group_id
      )
  ) THEN
    RAISE EXCEPTION 'Vincule agentes e gestores às equipes reais antes de converter';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.monitorias m LEFT JOIN public.users u ON u.id = m.evaluated_id
    WHERE m.team_id = p_group_id AND (u.primary_team_id IS NULL OR u.primary_team_id = p_group_id)
  ) THEN
    RAISE EXCEPTION 'Há monitorias sem equipe principal do agente avaliado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agent_feedbacks f LEFT JOIN public.users u ON u.id = f.agent_id
    WHERE f.team_id = p_group_id AND (u.primary_team_id IS NULL OR u.primary_team_id = p_group_id)
  ) THEN
    RAISE EXCEPTION 'Há feedbacks sem equipe principal do agente';
  END IF;
  DELETE FROM public.user_teams WHERE team_id = p_group_id;

  UPDATE public.monitorias m SET team_id = u.primary_team_id, team_name = t.name
  FROM public.users u JOIN public.teams t ON t.id = u.primary_team_id
  WHERE m.team_id = p_group_id AND m.evaluated_id = u.id;
  INSERT INTO public.form_teams (form_id, team_id)
  SELECT form_id, p_destination_team_id FROM public.form_teams WHERE team_id = p_group_id
  ON CONFLICT DO NOTHING;
  INSERT INTO public.form_teams (form_id, team_id)
  SELECT DISTINCT m.form_id, m.team_id FROM public.monitorias m
  WHERE m.ticket_group_team_id = p_group_id AND m.form_id IS NOT NULL AND m.team_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  DELETE FROM public.form_teams WHERE team_id = p_group_id;
  UPDATE public.forms SET team_id = p_destination_team_id WHERE team_id = p_group_id;
  UPDATE public.agent_feedbacks f SET team_id = u.primary_team_id
  FROM public.users u WHERE f.team_id = p_group_id AND f.agent_id = u.id AND u.primary_team_id IS NOT NULL;

  UPDATE public.teams SET kind = 'group' WHERE id = p_group_id;
  INSERT INTO public.team_groups(team_id, group_id)
  VALUES (p_destination_team_id, p_group_id) ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.convert_team_to_group(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_team_to_group(uuid, uuid) TO authenticated;

-- An audit cannot be owned by a group. A single mapped team is a safe
-- fallback; a group shared by PJ and CLT is ambiguous without an agent team.
CREATE OR REPLACE FUNCTION public.assign_monitoria_management_team()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_primary_team_id uuid; v_candidate uuid; v_kind text; v_team_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Manual evaluations have a management team but may have no Zendesk group.
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
    SELECT CASE WHEN count(*) = 1 THEN min(team_id) ELSE NULL END
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

CREATE OR REPLACE FUNCTION public.sync_monitoria_management_team()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.primary_team_id IS DISTINCT FROM OLD.primary_team_id AND NEW.primary_team_id IS NOT NULL THEN
    UPDATE public.monitorias m
    SET team_id = NEW.primary_team_id,
        team_name = (SELECT t.name FROM public.teams t WHERE t.id = NEW.primary_team_id)
    WHERE m.evaluated_id = NEW.id
      AND m.team_id IS DISTINCT FROM NEW.primary_team_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_monitoria_management_team() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
