-- =================================================================
-- teams.icon — coluna ausente no schema, exigida pelo frontend
--
-- TeamsManagement.tsx sempre envia { name, sigla, description, icon,
-- active } ao salvar uma equipe, mas o initial_schema criou teams sem
-- a coluna icon. O PostgREST rejeitava com
--   400 PGRST204: Could not find the 'icon' column of 'teams'
-- e a interface exibia "Não foi possível salvar a equipe".
--
-- O campo é usado de fato: o tipo Team o declara, o formulário tem
-- seletor de ícone e a listagem renderiza via getTeamIcon(t.icon).
-- =================================================================

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'Shield';

UPDATE public.teams SET icon = 'Shield' WHERE icon IS NULL;

NOTIFY pgrst, 'reload schema';
