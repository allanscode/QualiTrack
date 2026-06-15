-- =================================================================
-- Add primary_team_id column to users table
-- =================================================================
-- This column stores the user's primary team (for default badge display)
-- while team_ids / user_teams handles multiple team memberships.
-- =================================================================

-- Add column if not exists
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS primary_team_id UUID;

-- Add foreign key constraint (only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_users_primary_team' 
        AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
        ADD CONSTRAINT fk_users_primary_team
        FOREIGN KEY (primary_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_primary_team_id ON public.users(primary_team_id);

-- Optional: backfill from existing team_id if it was being used as primary
-- UPDATE public.users SET primary_team_id = team_id WHERE primary_team_id IS NULL AND team_id IS NOT NULL;