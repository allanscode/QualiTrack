-- A single model selection; API credentials remain in Supabase Secrets.
CREATE TABLE public.ai_model_config (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  model_id text NOT NULL CHECK (model_id ~ '^[A-Za-z0-9._:-]+/[A-Za-z0-9._:-]+$'),
  is_free boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id)
);
ALTER TABLE public.ai_model_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_model_config_admin_select ON public.ai_model_config
  FOR SELECT TO authenticated USING (_private.is_admin());
REVOKE ALL ON public.ai_model_config FROM anon;
-- Only the Edge Function service role writes, after checking the active admin
-- and validating the ID against live OpenRouter metadata. Direct writes bypass
-- that validation, so authenticated users receive no write grant or policy.
GRANT SELECT ON public.ai_model_config TO authenticated;
