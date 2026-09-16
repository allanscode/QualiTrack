CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
ALTER FUNCTION public.set_ai_guidelines_updated_at() SET search_path = '';
ALTER FUNCTION public.set_ai_drafts_updated_at() SET search_path = '';
REVOKE ALL ON FUNCTION public.update_updated_at(),public.set_ai_guidelines_updated_at(),public.set_ai_drafts_updated_at() FROM public,anon,authenticated;

-- Supabase default grants vary; make this application's privileges explicit.
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['users','teams','forms','monitorias','access_requests','quality_configs','dissatisfaction_fields','user_teams','user_preferences','business_hours','holidays','form_teams','helpdesk_submissions','ai_evaluation_guidelines','ai_evaluation_drafts'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM public,anon,authenticated',tbl);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',tbl);
  END LOOP;
END $$;
REVOKE INSERT,DELETE ON public.access_requests FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.helpdesk_submissions FROM authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.monitorias_display_id_seq TO authenticated,service_role;
REVOKE ALL ON public.vw_monitorias_suporte FROM public,anon;
GRANT SELECT ON public.vw_monitorias_suporte TO authenticated,service_role;
NOTIFY pgrst, 'reload schema';
