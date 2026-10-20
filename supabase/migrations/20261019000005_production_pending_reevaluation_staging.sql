-- Apply to develop only after review. Production monitoria IDs are external references.
CREATE TABLE public.production_pending_reevaluation_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_project text NOT NULL CHECK (production_project = 'vpytvgpsqdapgouyjowc'),
  production_monitoria_id uuid NOT NULL,
  ticket_id text NOT NULL,
  ticket_kind text NOT NULL CHECK (ticket_kind IN ('revenda', 'cliente_final', 'ticket_filho')),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  dialogue_sha256 text NOT NULL CHECK (dialogue_sha256 ~ '^[0-9a-f]{64}$'),
  dialogue_source text NOT NULL CHECK (dialogue_source IN ('production_snapshot', 'zendesk_comments')),
  source_comment_count integer NOT NULL CHECK (source_comment_count > 0),
  source_status text NOT NULL CHECK (source_status = 'pendente_revisao'),
  source_updated_at timestamptz NOT NULL,
  source_score numeric,
  source_form_id uuid NOT NULL,
  develop_form_id uuid NOT NULL,
  develop_form_sha256 text NOT NULL CHECK (develop_form_sha256 ~ '^[0-9a-f]{64}$'),
  guideline_sha256 text NOT NULL CHECK (guideline_sha256 ~ '^[0-9a-f]{64}$'),
  already_sent boolean NOT NULL,
  model text NOT NULL,
  suggested_score numeric NOT NULL CHECK (suggested_score BETWEEN 0 AND 100),
  suggested_answers jsonb NOT NULL,
  suggested_observations jsonb NOT NULL,
  summary text NOT NULL,
  auditor_note text NOT NULL,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvements jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_human_review boolean NOT NULL DEFAULT true,
  review_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (production_project, production_monitoria_id, input_sha256),
  CHECK (jsonb_typeof(suggested_answers) = 'object'),
  CHECK (jsonb_typeof(suggested_observations) = 'object'),
  CHECK (jsonb_typeof(strengths) = 'array'),
  CHECK (jsonb_typeof(improvements) = 'array'),
  CHECK (jsonb_typeof(review_reasons) = 'array')
);

CREATE INDEX production_pending_reevaluation_ticket_idx
  ON public.production_pending_reevaluation_candidates (ticket_id);
ALTER TABLE public.production_pending_reevaluation_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_pending_reevaluation_candidates FROM PUBLIC, anon, authenticated, service_role;
-- No client policies, selection RPC, publication path, or FK to develop monitorias.
