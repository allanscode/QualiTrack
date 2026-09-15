-- Retired dangerous historical seed. Version retained to preserve migration history.
-- Previously deleted public.users and recreated a fixed account/password.
-- Never replay that behavior on a new or restored production database.
-- Bootstrap an administrator through Auth + an explicit SQL role update;
-- see docs/security-and-supabase-migration.md. Existing applied databases are
-- not modified by this no-op. New security changes live in 20260915 migrations.
SELECT 1;
