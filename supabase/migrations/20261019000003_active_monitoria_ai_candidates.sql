-- Candidates are isolated from official monitorias and queue AI drafts/jobs.
CREATE TABLE public.active_monitoria_ai_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoria_id uuid NOT NULL REFERENCES public.monitorias(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'processing' CHECK (state IN ('processing', 'completed', 'failed')),
  source_updated_at timestamptz NOT NULL,
  source_status text NOT NULL CHECK (source_status IN ('aguardando_gestor_suporte', 'aguardando_gestor_qualidade')),
  form_id uuid NOT NULL REFERENCES public.forms(id),
  form_snapshot jsonb NOT NULL,
  guideline_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  official_snapshot jsonb NOT NULL,
  result jsonb,
  comparison jsonb,
  model text,
  error_message text,
  -- Local maintenance has no interactive admin actor. Keep that provenance
  -- explicit instead of attributing an AI run to a human account.
  created_by uuid REFERENCES public.users(id),
  generated_by text NOT NULL DEFAULT 'edge_admin'
    CHECK (generated_by IN ('edge_admin', 'local_openrouter')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  selected_by uuid REFERENCES public.users(id),
  selected_at timestamptz,
  selection_note text,
  UNIQUE (monitoria_id, request_id),
  CONSTRAINT candidate_origin_actor CHECK (
    (generated_by = 'edge_admin' AND created_by IS NOT NULL)
    OR (generated_by = 'local_openrouter' AND created_by IS NULL)
  ),
  CONSTRAINT candidate_completed_result CHECK (state <> 'completed' OR (result IS NOT NULL AND comparison IS NOT NULL))
);

CREATE UNIQUE INDEX active_monitoria_ai_one_processing ON public.active_monitoria_ai_candidates(monitoria_id) WHERE state = 'processing';
CREATE UNIQUE INDEX active_monitoria_ai_one_selected ON public.active_monitoria_ai_candidates(monitoria_id) WHERE selected_at IS NOT NULL;
CREATE INDEX active_monitoria_ai_candidates_state_idx ON public.active_monitoria_ai_candidates(state);
ALTER TABLE public.active_monitoria_ai_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY active_monitoria_ai_candidates_admin_read ON public.active_monitoria_ai_candidates
  FOR SELECT TO authenticated USING (_private.is_admin_user());
REVOKE ALL ON public.active_monitoria_ai_candidates FROM anon, authenticated;
GRANT SELECT ON public.active_monitoria_ai_candidates TO authenticated;
-- All writes are performed by helpdesk-queue after verifying the admin JWT.
