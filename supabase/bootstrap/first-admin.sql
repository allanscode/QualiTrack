-- ONE-TIME operator action in the NEW project's SQL Editor.
-- First create/invite the intended user in Supabase Auth, then replace BOTH
-- placeholders below with that exact identity. Never insert passwords via SQL.
BEGIN;
DO $$
DECLARE
  expected_id uuid := '00000000-0000-0000-0000-000000000000';
  expected_email text := 'REPLACE_WITH_CONFIRMED_EMAIL';
BEGIN
  LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
  IF expected_id = '00000000-0000-0000-0000-000000000000' OR expected_email = 'REPLACE_WITH_CONFIRMED_EMAIL' THEN
    RAISE EXCEPTION 'Replace both first-admin placeholders before execution';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE role = 'admin' AND active) THEN
    RAISE EXCEPTION 'An active administrator already exists. Use normal admin management.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = expected_id AND lower(email) = lower(expected_email) AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirmed Auth identity does not match';
  END IF;
  UPDATE public.users SET role = 'admin', active = true, must_change_password = true
    WHERE id = expected_id AND lower(email) = lower(expected_email) AND NOT is_provisional;
  IF NOT FOUND THEN RAISE EXCEPTION 'Matching application profile not found'; END IF;
END $$;
COMMIT;
