-- =================================================================
-- QUALITRACK — Initial Schema (Base Tables)
-- =================================================================
-- This is the FIRST migration that must run before all others.
-- Creates all fundamental tables needed by the application.
-- Idempotent: uses IF NOT EXISTS so it's safe to re-run.
-- =================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =================================================================
-- 1. teams
-- =================================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sigla TEXT,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =================================================================
-- 2. users
-- =================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'suporte' CHECK (role IN ('admin','gestor_qualidade','qualidade','gestor_suporte','suporte')),
  team_ids UUID[] DEFAULT '{}',
  primary_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =================================================================
-- 3. forms (evaluation forms)
-- =================================================================
CREATE TABLE IF NOT EXISTS public.forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  sections JSONB DEFAULT '[]'::jsonb,
  critical_errors JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =================================================================
-- 4. monitorias (main evaluation records)
-- =================================================================
CREATE TABLE IF NOT EXISTS public.monitorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES public.forms(id) ON DELETE SET NULL,
  evaluator_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  evaluated_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  ticket_id TEXT,
  channel TEXT,
  ticket_date DATE,
  analysis_date DATE,
  satisfaction_result TEXT,
  satisfaction_has_record BOOLEAN DEFAULT false,
  satisfaction_record_text TEXT,
  answers JSONB DEFAULT '{}'::jsonb,
  score NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'pendente_revisao',
  resolution_type TEXT,
  contestation_result TEXT,
  action_deadline_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  history JSONB DEFAULT '[]'::jsonb,
  dissatisfaction_answers JSONB DEFAULT '{}'::jsonb,
  evaluator_name TEXT,
  evaluated_name TEXT,
  form_name TEXT,
  team_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =================================================================
-- 5. access_requests (user onboarding)
-- =================================================================
CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =================================================================
-- 6. quality_configs
-- =================================================================
CREATE TABLE IF NOT EXISTS public.quality_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config JSONB DEFAULT '{}'::jsonb,
  config_version INTEGER DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =================================================================
-- 7. dissatisfaction_fields
-- =================================================================
CREATE TABLE IF NOT EXISTS public.dissatisfaction_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cliente', 'qualidade')),
  options TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  form_id UUID REFERENCES public.forms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =================================================================
-- 8. user_teams (N:N relationship)
-- =================================================================
CREATE TABLE IF NOT EXISTS public.user_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_user_team UNIQUE (user_id, team_id)
);

-- =================================================================
-- 9. user_preferences
-- =================================================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  preferences JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =================================================================
-- 10. business_hours
-- =================================================================
CREATE TABLE IF NOT EXISTS public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week SMALLINT NOT NULL UNIQUE CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT true,
  open_time TIME NOT NULL DEFAULT '08:00',
  close_time TIME NOT NULL DEFAULT '17:00'
);

-- =================================================================
-- 11. holidays
-- =================================================================
CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL UNIQUE,
  description TEXT
);

-- =================================================================
-- Seed: business hours (seg–sex 08:00–17:00)
-- =================================================================
INSERT INTO public.business_hours (day_of_week, is_open, open_time, close_time)
VALUES
  (0, false, '00:00', '00:00'),
  (1, true, '08:00', '17:00'),
  (2, true, '08:00', '17:00'),
  (3, true, '08:00', '17:00'),
  (4, true, '08:00', '17:00'),
  (5, true, '08:00', '17:00'),
  (6, false, '00:00', '00:00')
ON CONFLICT (day_of_week) DO UPDATE SET
  is_open = EXCLUDED.is_open,
  open_time = EXCLUDED.open_time,
  close_time = EXCLUDED.close_time;

-- =================================================================
-- Seed: holidays 2026
-- =================================================================
INSERT INTO public.holidays (holiday_date, description)
VALUES
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-09-07', 'Independência do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-12-25', 'Natal')
ON CONFLICT (holiday_date) DO NOTHING;

-- =================================================================
-- Enable RLS on all tables
-- =================================================================
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dissatisfaction_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
