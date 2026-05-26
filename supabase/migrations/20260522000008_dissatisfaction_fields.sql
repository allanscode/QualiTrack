-- =================================================================
-- M8: Create dissatisfaction_fields table + column
-- =================================================================

CREATE TABLE IF NOT EXISTS public.dissatisfaction_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cliente', 'qualidade')),
  options TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.monitorias ADD COLUMN IF NOT EXISTS dissatisfaction_answers JSONB DEFAULT '{}'::jsonb;
