-- =================================================================
-- Seed Production Data for QualiTrack
-- Execute no Supabase Dashboard → SQL Editor
-- =================================================================

-- =================================================================
-- 1. Teams
-- =================================================================
INSERT INTO public.teams (id, name, sigla, active, description)
VALUES 
  (gen_random_uuid(), 'Equipe Alpha', 'ALF', true, 'Equipe de atendimento Alpha'),
  (gen_random_uuid(), 'Equipe Beta', 'BET', true, 'Equipe de atendimento Beta')
ON CONFLICT (id) DO NOTHING;

-- Get team IDs for reference
-- SELECT id, name FROM public.teams WHERE name IN ('Equipe Alpha', 'Equipe Beta');

-- =================================================================
-- 2. Users (using fixed UUIDs for consistency)
-- =================================================================
INSERT INTO public.users (id, name, email, role, active, team_ids, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Admin QualiTrack', 'admin@qualitrack.local', 'admin', true, ARRAY[]::uuid[], now()),
  ('00000000-0000-0000-0000-000000000002', 'João Suporte', 'suporte@teste.com', 'suporte', true, ARRAY[]::uuid[], now()),
  ('00000000-0000-0000-0000-000000000003', 'Maria Auditora', 'auditor@teste.com', 'qualidade', true, ARRAY[]::uuid[], now()),
  ('00000000-0000-0000-0000-000000000004', 'Carlos Gestor Suporte', 'gestor.suporte@teste.com', 'gestor_suporte', true, ARRAY[]::uuid[], now()),
  ('00000000-0000-0000-0000-000000000005', 'Ana Gestora Qualidade', 'gestor.qualidade@teste.com', 'gestor_qualidade', true, ARRAY[]::uuid[], now())
ON CONFLICT (id) DO NOTHING;

-- =================================================================
-- 3. Forms
-- =================================================================
-- Get team_alpha ID
DO $$
DECLARE
  v_team_alpha_id uuid;
  v_form_id uuid := 'form-suporte-geral';
BEGIN
  SELECT id INTO v_team_alpha_id FROM public.teams WHERE sigla = 'ALF' LIMIT 1;
  
  IF v_team_alpha_id IS NOT NULL THEN
    INSERT INTO public.forms (id, title, description, team_id, active, createdBy, created_at, sections)
    VALUES (
      v_form_id,
      'Ficha de Atendimento Geral - Suporte',
      'Avaliação padrão de interações dos agentes de atendimento técnico.',
      v_team_alpha_id,
      true,
      '00000000-0000-0000-0000-000000000001',
      now(),
      '[]'::jsonb
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- =================================================================
-- 4. User-Teams relationships
-- =================================================================
DO $$
DECLARE
  v_team_alpha_id uuid;
BEGIN
  SELECT id INTO v_team_alpha_id FROM public.teams WHERE sigla = 'ALF' LIMIT 1;
  
  IF v_team_alpha_id IS NOT NULL THEN
    INSERT INTO public.user_teams (user_id, team_id)
    VALUES
      ('00000000-0000-0000-0000-000000000002', v_team_alpha_id),
      ('00000000-0000-0000-0000-000000000003', v_team_alpha_id),
      ('00000000-0000-0000-0000-000000000004', v_team_alpha_id),
      ('00000000-0000-0000-0000-000000000005', v_team_alpha_id)
    ON CONFLICT (id) DO NOTHING;
    
    -- Update users' team_ids array
    UPDATE public.users 
    SET team_ids = ARRAY[v_team_alpha_id]
    WHERE id IN (
      '00000000-0000-0000-0000-000000000000002',
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000004',
      '00000000-0000-0000-0000-000000000005'
    );
  END IF;
END $$;

-- =================================================================
-- 5. User Preferences
-- =================================================================
INSERT INTO public.user_preferences (user_id, preferences, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000002', '{"theme": "system", "sidebar_color": ""}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000003', '{"theme": "system", "sidebar_color": ""}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000004', '{"theme": "system", "sidebar_color": ""}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000005', '{"theme": "system", "sidebar_color": ""}'::jsonb, now())
ON CONFLICT (user_id) DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = now();

-- =================================================================
-- 6. Quality Configs (default)
-- =================================================================
INSERT INTO public.quality_configs (id, config, config_version, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '{
    "targetScore": 87,
    "targetReversalRate": 15,
    "businessHours": {
      "timezone": "America/Sao_Paulo",
      "workingDays": [1,2,3,4,5],
      "startTime": "08:00",
      "endTime": "17:00"
    },
    "slaHours": 24,
    "weights": {
      "postura": 30,
      "processo": 40,
      "resolucao": 30
    }
  }'::jsonb,
  1,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- =================================================================
-- 7. Verification Queries
-- =================================================================
-- SELECT 'teams' as table_name, count(*) FROM public.teams
-- UNION ALL SELECT 'users', count(*) FROM public.users
-- UNION ALL SELECT 'forms', count(*) FROM public.forms
-- UNION ALL SELECT 'user_teams', count(*) FROM public.user_teams
-- UNION ALL SELECT 'user_preferences', count(*) FROM public.user_preferences
-- UNION ALL SELECT 'quality_configs', count(*) FROM public.quality_configs;