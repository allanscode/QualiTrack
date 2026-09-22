CREATE OR REPLACE FUNCTION _private.can_access_ai_ticket(p_ticket_id TEXT, p_creator UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.active
    AND (u.role IN ('admin', 'gestor_qualidade') OR (
      u.role = 'qualidade' AND (
        EXISTS (SELECT 1 FROM public.queue_ticket_assignments a
          WHERE a.ticket_id = p_ticket_id AND a.assigned_to = u.id)
        OR (p_creator = u.id AND NOT EXISTS (
          SELECT 1 FROM public.queue_ticket_assignments a WHERE a.ticket_id = p_ticket_id))
      )
    )));
$$;
REVOKE ALL ON FUNCTION _private.can_access_ai_ticket(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION _private.can_access_ai_ticket(TEXT, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "ai_drafts_select_policy" ON public.ai_evaluation_drafts;
DROP POLICY IF EXISTS "ai_drafts_write_policy" ON public.ai_evaluation_drafts;
CREATE POLICY ai_drafts_owner_read ON public.ai_evaluation_drafts FOR SELECT TO authenticated
  USING (_private.can_access_ai_ticket(ticket_id, created_by));
CREATE POLICY ai_drafts_owner_delete ON public.ai_evaluation_drafts FOR DELETE TO authenticated
  USING (_private.can_access_ai_ticket(ticket_id, created_by));
REVOKE INSERT, UPDATE ON public.ai_evaluation_drafts FROM anon, authenticated;
GRANT SELECT, DELETE ON public.ai_evaluation_drafts TO authenticated;

DROP POLICY IF EXISTS ai_evaluation_jobs_read ON public.ai_evaluation_jobs;
CREATE POLICY ai_evaluation_jobs_owner_read ON public.ai_evaluation_jobs FOR SELECT TO authenticated
  USING (_private.can_access_ai_ticket(ticket_id, started_by));
NOTIFY pgrst, 'reload schema';
