-- =================================================================
-- form_teams — vínculo N:N entre forms e teams
--
-- forms.team_id só permitia UMA equipe por formulário. O admin pedia
-- vincular um formulário a mais de uma equipe (ex.: um formulário
-- compartilhado por "Cliente Final" e "Revenda").
--
-- Verificado antes de mudar: forms.team_id não é usado por nenhuma RLS
-- policy nem filtra a seleção de formulário ao criar monitoria — o
-- único consumidor é o badge de exibição em FormsManagement.tsx. Isso
-- torna a migração de baixo risco: nenhuma regra de acesso depende
-- dele.
--
-- forms.team_id é MANTIDO (não removido) para não quebrar o tipo
-- EvaluationForm nem forçar reescrita de dados existentes agora — vira
-- redundante, populado só por compatibilidade a partir daqui.
-- =================================================================

CREATE TABLE IF NOT EXISTS public.form_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_form_team UNIQUE (form_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_form_teams_form_id ON public.form_teams(form_id);
CREATE INDEX IF NOT EXISTS idx_form_teams_team_id ON public.form_teams(team_id);

ALTER TABLE public.form_teams ENABLE ROW LEVEL SECURITY;

-- Mesma governança de forms: leitura livre para autenticados, escrita
-- restrita a admin/gestor_qualidade (ver forms_select / forms_admin_write
-- em apply_all_pending.sql).
DROP POLICY IF EXISTS "form_teams_select" ON public.form_teams;
CREATE POLICY "form_teams_select" ON public.form_teams
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "form_teams_admin_write" ON public.form_teams;
CREATE POLICY "form_teams_admin_write" ON public.form_teams
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'gestor_qualidade'))
  );

-- Backfill: formulários que já tinham uma equipe única em team_id
-- ganham o vínculo equivalente na tabela nova.
INSERT INTO public.form_teams (form_id, team_id)
SELECT id, team_id FROM public.forms
WHERE team_id IS NOT NULL
ON CONFLICT (form_id, team_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
