-- After the Edge worker accepts a job, a browser disconnect must not cancel
-- it. Only the worker may set its terminal state from that point onward.
CREATE OR REPLACE FUNCTION public.fail_ai_evaluation_job(p_job_id UUID, p_error TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  UPDATE public.ai_evaluation_jobs SET status = 'failed', finished_at = now(), error_message = left(p_error, 500)
  WHERE job_id = p_job_id AND started_by = (SELECT auth.uid())
    AND status = 'running' AND execution_started_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fail_ai_evaluation_job(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_ai_evaluation_job(UUID, TEXT) FROM PUBLIC, anon;
NOTIFY pgrst, 'reload schema';
