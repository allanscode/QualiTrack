-- =================================================================
-- Cleanup: remove legacy/unused columns from public.users
-- Drops: password, reset_token, team_id (with FK)
-- Adds: CHECK constraint for role, fixes default
-- =================================================================

-- Step 1: Guard — fail if any user has role 'tecnico'
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.users WHERE role = 'tecnico';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'ABORTANDO: % usuario(s) com role ''tecnico'' encontrado(s). Migre manualmente antes de rodar esta migration.', v_count;
  END IF;
END $$;

-- Step 2: Drop FK constraint before dropping the column
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_team_id_fkey;

-- Step 3: Drop unused columns
ALTER TABLE public.users DROP COLUMN IF EXISTS password;
ALTER TABLE public.users DROP COLUMN IF EXISTS reset_token;
ALTER TABLE public.users DROP COLUMN IF EXISTS team_id;

-- Step 4: Fix role — add CHECK constraint and correct default
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'suporte';
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'gestor_qualidade', 'qualidade', 'gestor_suporte', 'suporte'));
