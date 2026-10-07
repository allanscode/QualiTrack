-- Permit the Gemma-only worker phase while retaining legacy phase values for
-- jobs started by an older Edge Function during a rolling deployment.
ALTER TABLE public.ai_evaluation_jobs
  DROP CONSTRAINT ai_evaluation_jobs_phase_check;
ALTER TABLE public.ai_evaluation_jobs
  ADD CONSTRAINT ai_evaluation_jobs_phase_check
  CHECK (phase IN ('pending', 'running_glm', 'fallback_gemini', 'running_gemma',
                  'retry_pending', 'completed', 'cancelled', 'failed'));

CREATE OR REPLACE FUNCTION public.set_ai_evaluation_phase(p_job_id UUID, p_phase TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF auth.role() <> 'service_role' OR p_phase NOT IN ('running_glm', 'fallback_gemini', 'running_gemma', 'retry_pending') THEN
    RAISE EXCEPTION 'Transição de IA não autorizada.';
  END IF;
  UPDATE public.ai_evaluation_jobs SET phase = p_phase
  WHERE job_id = p_job_id AND status = 'running';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.set_ai_evaluation_phase(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ai_evaluation_phase(UUID, TEXT) TO service_role;
