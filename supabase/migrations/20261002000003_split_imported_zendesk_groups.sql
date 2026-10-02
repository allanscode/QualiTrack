-- The legacy Zendesk import stored ticket groups in teams. Preserve those IDs
-- as ticket groups and put people and evaluations under management teams.
BEGIN;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS parent_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_parent_not_self;
ALTER TABLE public.teams ADD CONSTRAINT teams_parent_not_self CHECK (parent_team_id IS DISTINCT FROM id);
CREATE INDEX IF NOT EXISTS teams_parent_team_id_idx ON public.teams(parent_team_id)
  WHERE parent_team_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_team_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.parent_team_id IS NOT NULL THEN
    IF NEW.kind <> 'team' OR NOT EXISTS (
      SELECT 1 FROM public.teams parent
      WHERE parent.id = NEW.parent_team_id AND parent.kind = 'team' AND parent.parent_team_id IS NULL
    ) OR EXISTS (SELECT 1 FROM public.teams child WHERE child.parent_team_id = NEW.id) THEN
      RAISE EXCEPTION 'A equipe superior deve ser uma equipe principal, sem outra equipe acima dela';
    END IF;
  ELSIF NEW.kind = 'group' AND EXISTS (
    SELECT 1 FROM public.teams child WHERE child.parent_team_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Uma equipe com subequipes não pode ser convertida em grupo';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_team_parent() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validate_team_parent ON public.teams;
CREATE TRIGGER trg_validate_team_parent BEFORE INSERT OR UPDATE OF parent_team_id, kind
  ON public.teams FOR EACH ROW EXECUTE FUNCTION public.validate_team_parent();

DO $migration$
DECLARE
  v_web uuid;
  v_fiscal uuid;
  v_contabil uuid;
  v_pagamentos uuid;
  v_bruno uuid;
  v_duarte uuid;
  v_sumwise uuid;
  v_trindade uuid;
BEGIN
  -- A clean installation has no imported groups. This data migration runs
  -- only against the reviewed legacy import, and refuses a changed snapshot.
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE name = 'Grupo Bruno' AND kind = 'team') THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.teams WHERE kind = 'team') <> 66
     OR EXISTS (SELECT 1 FROM public.teams WHERE kind = 'group')
     OR EXISTS (SELECT 1 FROM public.teams WHERE zendesk_group_id IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.teams WHERE name = 'Grupo Duarte' AND kind = 'team')
     OR NOT EXISTS (SELECT 1 FROM public.teams WHERE name = 'Grupo SumWise' AND kind = 'team')
     OR NOT EXISTS (SELECT 1 FROM public.teams WHERE name = 'Grupo Trindade' AND kind = 'team')
     OR NOT EXISTS (SELECT 1 FROM public.teams WHERE name = 'Grupo WebPosto' AND kind = 'team') THEN
    RAISE EXCEPTION 'A lista de grupos importados mudou; revise a divisão antes de aplicar esta migração';
  END IF;

  SELECT id INTO STRICT v_web FROM public.teams
    WHERE name = 'Grupo WebPosto' AND kind = 'team';
  UPDATE public.teams SET name = 'WebPosto', sigla = 'WEB',
    description = 'Equipe principal de atendimento da WebPosto', icon = 'Headset'
    WHERE id = v_web;

  CREATE TEMP TABLE legacy_ticket_groups ON COMMIT DROP AS
    SELECT id, name, active FROM public.teams
    WHERE kind = 'team' AND name NOT IN ('Equipe Alpha', 'Equipe Beta') AND id <> v_web;

  INSERT INTO public.teams (name, sigla, description, icon, kind, active)
    VALUES ('PJ Bruno', 'PJB', 'Equipe de gestão dos profissionais PJ do grupo Bruno', 'Users', 'team', true)
    RETURNING id INTO v_bruno;
  INSERT INTO public.teams (name, sigla, description, icon, kind, active)
    VALUES ('PJ Duarte', 'PJD', 'Equipe de gestão dos profissionais PJ do grupo Duarte', 'Users', 'team', true)
    RETURNING id INTO v_duarte;
  INSERT INTO public.teams (name, sigla, description, icon, kind, active)
    VALUES ('PJ SumWise', 'PJS', 'Equipe de gestão dos profissionais PJ do grupo SumWise', 'Users', 'team', true)
    RETURNING id INTO v_sumwise;
  INSERT INTO public.teams (name, sigla, description, icon, kind, active)
    VALUES ('PJ Trindade', 'PJT', 'Equipe de gestão dos profissionais PJ do grupo Trindade', 'Users', 'team', true)
    RETURNING id INTO v_trindade;
  INSERT INTO public.teams (name, sigla, description, icon, kind, active, parent_team_id)
    VALUES ('Fiscal', 'FIS', 'Equipe de gestão do atendimento fiscal', 'Shield', 'team', true, v_web)
    RETURNING id INTO v_fiscal;
  INSERT INTO public.teams (name, sigla, description, icon, kind, active, parent_team_id)
    VALUES ('Contábil', 'CON', 'Equipe de gestão do atendimento contábil', 'Shield', 'team', true, v_web)
    RETURNING id INTO v_contabil;
  INSERT INTO public.teams (name, sigla, description, icon, kind, active, parent_team_id)
    VALUES ('Mais Pagamentos', 'MPG', 'Equipe de gestão do atendimento Mais Pagamentos', 'Shield', 'team', true, v_web)
    RETURNING id INTO v_pagamentos;

  CREATE TEMP TABLE person_management_team ON COMMIT DROP AS
    SELECT u.id AS user_id, u.primary_team_id AS old_group_id,
      CASE
        WHEN g.name ILIKE 'Grupo Bruno' THEN v_bruno
        WHEN g.name ILIKE 'Grupo Duarte' THEN v_duarte
        WHEN g.name ILIKE 'Grupo SumWise' THEN v_sumwise
        WHEN g.name ILIKE 'Grupo Trindade%' THEN v_trindade
        WHEN g.name ILIKE '%Fiscal%' THEN v_fiscal
        WHEN g.name ILIKE '%Cont%bil%' THEN v_contabil
        WHEN g.name ILIKE 'Mais Pagamentos%' THEN v_pagamentos
        ELSE v_web
      END AS new_team_id
    FROM public.users u
    JOIN legacy_ticket_groups g ON g.id = u.primary_team_id
    WHERE u.role IN ('suporte', 'gestor_suporte');

  -- The original Zendesk membership determines ticket coverage. Shared
  -- Cliente Final and Revenda groups also belong to all four PJ teams.
  CREATE TEMP TABLE legacy_group_team_links ON COMMIT DROP AS
    SELECT DISTINCT ut.team_id AS group_id, p.new_team_id AS team_id
    FROM public.user_teams ut
    JOIN legacy_ticket_groups g ON g.id = ut.team_id
    JOIN person_management_team p ON p.user_id = ut.user_id;

  INSERT INTO legacy_group_team_links (group_id, team_id)
    SELECT g.id, management.id
    FROM legacy_ticket_groups g
    CROSS JOIN (VALUES (v_web), (v_bruno), (v_duarte), (v_sumwise), (v_trindade)) AS management(id)
    WHERE g.name ILIKE '%Cliente Final%' OR g.name ILIKE '%Revenda%'
    EXCEPT SELECT group_id, team_id FROM legacy_group_team_links;

  INSERT INTO legacy_group_team_links (group_id, team_id)
    SELECT g.id, CASE
      WHEN g.name ILIKE '%Fiscal%' THEN v_fiscal
      WHEN g.name ILIKE '%Cont%bil%' THEN v_contabil
      WHEN g.name ILIKE 'Mais Pagamentos%' THEN v_pagamentos
      WHEN g.name ILIKE 'Grupo Bruno' THEN v_bruno
      WHEN g.name ILIKE 'Grupo Duarte' THEN v_duarte
      WHEN g.name ILIKE 'Grupo SumWise' THEN v_sumwise
      WHEN g.name ILIKE 'Grupo Trindade%' THEN v_trindade
      ELSE NULL
    END
    FROM legacy_ticket_groups g
    WHERE g.name ILIKE '%Fiscal%' OR g.name ILIKE '%Cont%bil%'
       OR g.name ILIKE 'Mais Pagamentos%'
       OR g.name ILIKE 'Grupo Bruno' OR g.name ILIKE 'Grupo Duarte'
       OR g.name ILIKE 'Grupo SumWise' OR g.name ILIKE 'Grupo Trindade%'
    EXCEPT SELECT group_id, team_id FROM legacy_group_team_links;

  -- Imported groups without staff still need an organizational owner.
  INSERT INTO legacy_group_team_links (group_id, team_id)
    SELECT g.id, v_web FROM legacy_ticket_groups g
    WHERE NOT EXISTS (SELECT 1 FROM legacy_group_team_links l WHERE l.group_id = g.id);

  IF EXISTS (
    SELECT 1 FROM public.monitorias m
    JOIN legacy_ticket_groups g ON g.id = m.team_id
    LEFT JOIN person_management_team p ON p.user_id = m.evaluated_id
    WHERE p.new_team_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.agent_feedbacks f
    JOIN legacy_ticket_groups g ON g.id = f.team_id
    LEFT JOIN person_management_team p ON p.user_id = f.agent_id
    WHERE p.new_team_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.ai_evaluation_drafts d
    JOIN legacy_ticket_groups g ON g.id = d.team_id
    LEFT JOIN person_management_team p ON p.user_id = d.agent_id
    WHERE p.new_team_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Há monitorias, feedbacks ou rascunhos sem equipe gestora identificada';
  END IF;

  UPDATE public.monitorias m SET ticket_group_team_id = m.team_id
  FROM legacy_ticket_groups g
  WHERE m.team_id = g.id AND m.ticket_group_team_id IS NULL;

  -- Moving a person's primary team also transfers their historical
  -- monitorias through trg_sync_monitoria_management_team.
  UPDATE public.users u SET primary_team_id = p.new_team_id
  FROM person_management_team p WHERE u.id = p.user_id;

  -- Quality profiles do not need a support-management team.
  UPDATE public.users u SET primary_team_id = NULL
  FROM legacy_ticket_groups g
  WHERE u.primary_team_id = g.id AND u.role NOT IN ('suporte', 'gestor_suporte');

  UPDATE public.agent_feedbacks f SET team_id = p.new_team_id
  FROM person_management_team p
  WHERE f.agent_id = p.user_id AND f.team_id IN (SELECT id FROM legacy_ticket_groups);

  UPDATE public.ai_evaluation_drafts d SET team_id = p.new_team_id
  FROM person_management_team p
  WHERE d.agent_id = p.user_id AND d.team_id IN (SELECT id FROM legacy_ticket_groups);

  INSERT INTO public.form_teams (form_id, team_id)
    SELECT DISTINCT ft.form_id, l.team_id
    FROM public.form_teams ft
    JOIN legacy_group_team_links l ON l.group_id = ft.team_id
    ON CONFLICT DO NOTHING;
  DELETE FROM public.form_teams ft USING legacy_ticket_groups g WHERE ft.team_id = g.id;

  IF EXISTS (SELECT 1 FROM public.forms f JOIN legacy_ticket_groups g ON g.id = f.team_id
             WHERE NOT EXISTS (SELECT 1 FROM legacy_group_team_links l WHERE l.group_id = g.id)) THEN
    RAISE EXCEPTION 'Há formulário sem equipe gestora correspondente';
  END IF;
  UPDATE public.forms f SET team_id = COALESCE(
    (SELECT l.team_id FROM legacy_group_team_links l WHERE l.group_id = f.team_id AND l.team_id = v_web LIMIT 1),
    (SELECT l.team_id FROM legacy_group_team_links l WHERE l.group_id = f.team_id ORDER BY l.team_id LIMIT 1))
  WHERE f.team_id IN (SELECT id FROM legacy_ticket_groups);

  DELETE FROM public.user_teams ut USING legacy_ticket_groups g WHERE ut.team_id = g.id;
  INSERT INTO public.user_teams (user_id, team_id)
    SELECT user_id, new_team_id FROM person_management_team ON CONFLICT DO NOTHING;

  IF EXISTS (SELECT 1 FROM public.users u JOIN legacy_ticket_groups g ON g.id = u.primary_team_id)
     OR EXISTS (SELECT 1 FROM public.monitorias m JOIN legacy_ticket_groups g ON g.id = m.team_id)
     OR EXISTS (SELECT 1 FROM public.agent_feedbacks f JOIN legacy_ticket_groups g ON g.id = f.team_id)
     OR EXISTS (SELECT 1 FROM public.ai_evaluation_drafts d JOIN legacy_ticket_groups g ON g.id = d.team_id)
     OR EXISTS (SELECT 1 FROM public.form_teams ft JOIN legacy_ticket_groups g ON g.id = ft.team_id)
     OR EXISTS (SELECT 1 FROM public.forms f JOIN legacy_ticket_groups g ON g.id = f.team_id) THEN
    RAISE EXCEPTION 'Ainda existem dependências de equipe nos grupos importados';
  END IF;

  UPDATE public.teams t SET kind = 'group' FROM legacy_ticket_groups g WHERE t.id = g.id;
  INSERT INTO public.team_groups (group_id, team_id)
    SELECT DISTINCT group_id, team_id FROM legacy_group_team_links ON CONFLICT DO NOTHING;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
