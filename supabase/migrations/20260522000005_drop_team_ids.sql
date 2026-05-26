-- =================================================================
-- M5: Remover coluna team_ids (substituída por user_teams)
-- =================================================================

ALTER TABLE public.users DROP COLUMN IF EXISTS team_ids;
