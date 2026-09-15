BEGIN;
-- Never grant admin by email or client-controlled Auth metadata.
-- New users are activated explicitly by the administrative invite workflow.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE provisional public.users%ROWTYPE;
BEGIN
  SELECT * INTO provisional FROM public.users
    WHERE lower(email) = lower(NEW.email) AND is_provisional = true AND id <> NEW.id
    FOR UPDATE;
  IF provisional.id IS NOT NULL THEN
    -- Free the unique email within this transaction, insert the target BEFORE
    -- changing foreign keys, and remove the provisional record only at the end.
    UPDATE public.users SET email = provisional.id::text || '@migration.invalid' WHERE id = provisional.id;
  END IF;
  INSERT INTO public.users (id, email, name, role, primary_team_id, active, must_change_password, created_at, external_id, source_system, is_provisional)
  VALUES (NEW.id, lower(NEW.email), COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'suporte', provisional.primary_team_id, false, true, COALESCE(NEW.created_at, now()), provisional.external_id, provisional.source_system, false)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  IF provisional.id IS NOT NULL THEN
    UPDATE public.monitorias SET evaluated_id = NEW.id WHERE evaluated_id = provisional.id;
    UPDATE public.monitorias SET evaluator_id = NEW.id WHERE evaluator_id = provisional.id;
    UPDATE public.forms SET created_by = NEW.id WHERE created_by = provisional.id;
    UPDATE public.helpdesk_submissions SET created_by = NEW.id WHERE created_by = provisional.id;
    UPDATE public.ai_evaluation_guidelines SET created_by = NEW.id WHERE created_by = provisional.id;
    UPDATE public.ai_evaluation_drafts SET created_by = NEW.id WHERE created_by = provisional.id;
    UPDATE public.ai_evaluation_drafts SET agent_id = NEW.id WHERE agent_id = provisional.id;
    INSERT INTO public.user_teams (user_id, team_id)
      SELECT NEW.id, team_id FROM public.user_teams WHERE user_id = provisional.id
      ON CONFLICT (user_id, team_id) DO NOTHING;
    INSERT INTO public.user_preferences (user_id, preferences)
      SELECT NEW.id, preferences FROM public.user_preferences WHERE user_id = provisional.id
      ON CONFLICT (user_id) DO NOTHING;
    DELETE FROM public.users WHERE id = provisional.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
COMMIT;
