-- =====================================================================
-- QUALITRACK — Migrations Pendentes (consolidado idempotente)
-- Execute INTEIRO no SQL Editor do Supabase Dashboard.
-- Seguro para rodar mais de uma vez (IF NOT EXISTS / IF EXISTS).
-- =====================================================================

-- =====================================================================
-- 1. user_teams (N:N Users ↔ Teams)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_user_team UNIQUE (user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_user_teams_user ON public.user_teams(user_id);
CREATE INDEX IF NOT EXISTS idx_user_teams_team ON public.user_teams(team_id);

-- Popular a partir de team_ids existente (se a coluna ainda existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'team_ids') THEN
    INSERT INTO public.user_teams (user_id, team_id)
    SELECT u.id, unnest(u.team_ids)::uuid
    FROM public.users u
    WHERE u.team_ids IS NOT NULL AND array_length(u.team_ids, 1) > 0
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- RLS para user_teams
ALTER TABLE public.user_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_teams_select" ON public.user_teams;
DROP POLICY IF EXISTS "user_teams_insert" ON public.user_teams;
DROP POLICY IF EXISTS "user_teams_update" ON public.user_teams;
DROP POLICY IF EXISTS "user_teams_delete" ON public.user_teams;
CREATE POLICY "user_teams_select" ON public.user_teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_teams_insert" ON public.user_teams FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade','gestor_suporte'))
);
CREATE POLICY "user_teams_update" ON public.user_teams FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade','gestor_suporte'))
);
CREATE POLICY "user_teams_delete" ON public.user_teams FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade','gestor_suporte'))
);

-- =====================================================================
-- 2. business_hours
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week SMALLINT NOT NULL UNIQUE CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT true,
  open_time TIME NOT NULL DEFAULT '08:00',
  close_time TIME NOT NULL DEFAULT '17:00'
);

-- Seed: seg–sex 08:00–17:00 (INSERT ... ON CONFLICT para ser idempotente)
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

-- RLS para business_hours
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bh_select" ON public.business_hours;
DROP POLICY IF EXISTS "bh_admin" ON public.business_hours;
CREATE POLICY "bh_select" ON public.business_hours FOR SELECT TO authenticated USING (true);
CREATE POLICY "bh_admin" ON public.business_hours FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
);

-- =====================================================================
-- 3. holidays
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL UNIQUE,
  description TEXT
);

-- Seed: feriados nacionais BR 2026
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

-- RLS para holidays
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "holidays_select" ON public.holidays;
DROP POLICY IF EXISTS "holidays_admin" ON public.holidays;
CREATE POLICY "holidays_select" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "holidays_admin" ON public.holidays FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
);

-- =====================================================================
-- 4. dissatisfaction_fields
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.dissatisfaction_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cliente', 'qualidade')),
  options TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.monitorias ADD COLUMN IF NOT EXISTS dissatisfaction_answers JSONB DEFAULT '{}'::jsonb;

-- RLS para dissatisfaction_fields
ALTER TABLE public.dissatisfaction_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dissatisfaction_fields_select" ON public.dissatisfaction_fields;
DROP POLICY IF EXISTS "dissatisfaction_fields_admin_write" ON public.dissatisfaction_fields;
CREATE POLICY "dissatisfaction_fields_select" ON public.dissatisfaction_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "dissatisfaction_fields_admin_write" ON public.dissatisfaction_fields FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
);

-- =====================================================================
-- 5. Colunas novas em monitorias (idempotente)
-- =====================================================================
ALTER TABLE public.monitorias ADD COLUMN IF NOT EXISTS resolution_type TEXT;
ALTER TABLE public.monitorias ADD COLUMN IF NOT EXISTS contestation_result TEXT;
ALTER TABLE public.monitorias ADD COLUMN IF NOT EXISTS evaluator_name TEXT;
ALTER TABLE public.monitorias ADD COLUMN IF NOT EXISTS evaluated_name TEXT;
ALTER TABLE public.monitorias ADD COLUMN IF NOT EXISTS form_name TEXT;
ALTER TABLE public.monitorias ADD COLUMN IF NOT EXISTS team_name TEXT;

-- CHECK constraints (DROP + ADD para evitar erro se já existem)
ALTER TABLE public.monitorias DROP CONSTRAINT IF EXISTS chk_monitoria_status;
ALTER TABLE public.monitorias ADD CONSTRAINT chk_monitoria_status CHECK (status IN (
  'pendente_revisao','em_contestacao','aguardando_gestor_suporte',
  'aguardando_gestor_qualidade','concluida','contestacao_aceita',
  'contestacao_negada','finalizada_alterada','reavaliacao_solicitada'
));

ALTER TABLE public.monitorias DROP CONSTRAINT IF EXISTS chk_resolution_type;
ALTER TABLE public.monitorias ADD CONSTRAINT chk_resolution_type CHECK (resolution_type IS NULL OR resolution_type IN ('human','automatic'));

ALTER TABLE public.monitorias DROP CONSTRAINT IF EXISTS chk_contestation_result;
ALTER TABLE public.monitorias ADD CONSTRAINT chk_contestation_result CHECK (contestation_result IS NULL OR contestation_result IN ('approved','rejected','pending'));

-- =====================================================================
-- 6. Renomear deadline_at → action_deadline_at (se ainda não foi)
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'monitorias' AND column_name = 'deadline_at') THEN
    ALTER TABLE public.monitorias RENAME COLUMN deadline_at TO action_deadline_at;
  END IF;
END $$;

-- Índice para action_deadline_at
DROP INDEX IF EXISTS idx_monitorias_deadline;
CREATE INDEX IF NOT EXISTS idx_monitorias_action_deadline ON public.monitorias(action_deadline_at)
  WHERE status NOT IN ('concluida','finalizada_alterada') AND active = true;

-- =====================================================================
-- 7. RLS monitorias v3 — gestor_suporte usa user_teams
-- =====================================================================
ALTER TABLE public.monitorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monitorias_select_policy" ON public.monitorias;
DROP POLICY IF EXISTS "monitorias_insert_policy" ON public.monitorias;
DROP POLICY IF EXISTS "monitorias_update_policy" ON public.monitorias;
DROP POLICY IF EXISTS "monitorias_delete_policy" ON public.monitorias;

CREATE POLICY "monitorias_select_policy" ON public.monitorias FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.active = true AND (
      users.role = 'admin'
      OR users.role = 'gestor_qualidade'
      OR (users.role = 'suporte' AND monitorias.evaluated_id = auth.uid())
      OR (users.role = 'qualidade' AND monitorias.evaluator_id = auth.uid())
      OR (
        users.role = 'gestor_suporte' AND EXISTS (
          SELECT 1 FROM public.user_teams
          WHERE user_teams.user_id = users.id AND user_teams.team_id = monitorias.team_id
        )
      )
    )
  )
);

CREATE POLICY "monitorias_insert_policy" ON public.monitorias FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.active = true
    AND users.role IN ('admin', 'gestor_qualidade', 'qualidade')
  )
);

CREATE POLICY "monitorias_update_policy" ON public.monitorias FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.active = true AND (
      users.role = 'admin'
      OR users.role = 'gestor_qualidade'
      OR (users.role = 'suporte' AND monitorias.evaluated_id = auth.uid())
      OR (users.role = 'qualidade' AND monitorias.evaluator_id = auth.uid())
      OR (
        users.role = 'gestor_suporte' AND EXISTS (
          SELECT 1 FROM public.user_teams
          WHERE user_teams.user_id = users.id AND user_teams.team_id = monitorias.team_id
        )
      )
    )
  )
);

CREATE POLICY "monitorias_delete_policy" ON public.monitorias FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.active = true AND users.role = 'admin'
  )
);

-- =====================================================================
-- 8. RLS para tabelas restantes
-- =====================================================================
-- users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_admin_write" ON public.users;
CREATE POLICY "users_select" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_admin_write" ON public.users FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade','gestor_suporte'))
);

-- teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teams_select" ON public.teams;
DROP POLICY IF EXISTS "teams_admin_write" ON public.teams;
CREATE POLICY "teams_select" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_admin_write" ON public.teams FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- forms
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "forms_select" ON public.forms;
DROP POLICY IF EXISTS "forms_admin_write" ON public.forms;
CREATE POLICY "forms_select" ON public.forms FOR SELECT TO authenticated USING (true);
CREATE POLICY "forms_admin_write" ON public.forms FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
);

-- access_requests
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "access_requests_insert" ON public.access_requests;
DROP POLICY IF EXISTS "access_requests_authenticated_insert" ON public.access_requests;
DROP POLICY IF EXISTS "access_requests_admin_read" ON public.access_requests;
DROP POLICY IF EXISTS "access_requests_admin_write" ON public.access_requests;
CREATE POLICY "access_requests_insert" ON public.access_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "access_requests_authenticated_insert" ON public.access_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "access_requests_admin_read" ON public.access_requests FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade','gestor_suporte'))
);
CREATE POLICY "access_requests_admin_write" ON public.access_requests FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
);

-- critical_criteria (se existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'critical_criteria' AND table_schema = 'public') THEN
    ALTER TABLE public.critical_criteria ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "critical_criteria_select" ON public.critical_criteria;
    DROP POLICY IF EXISTS "critical_criteria_admin_write" ON public.critical_criteria;
    CREATE POLICY "critical_criteria_select" ON public.critical_criteria FOR SELECT TO authenticated USING (true);
    CREATE POLICY "critical_criteria_admin_write" ON public.critical_criteria FOR ALL TO authenticated USING (
      EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
    );
  END IF;
END $$;

-- quality_configs
ALTER TABLE public.quality_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quality_configs_select" ON public.quality_configs;
DROP POLICY IF EXISTS "quality_configs_admin_write" ON public.quality_configs;
CREATE POLICY "quality_configs_select" ON public.quality_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "quality_configs_admin_write" ON public.quality_configs FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
);

-- =====================================================================
-- 9. Função process_action_deadline_timeouts
-- =====================================================================
DROP FUNCTION IF EXISTS process_sla_timeouts();
CREATE OR REPLACE FUNCTION process_action_deadline_timeouts()
RETURNS void AS $$
DECLARE
  v_monitoria RECORD;
  v_new_score numeric;
  v_note text;
  v_is_quality_turn boolean;
  v_is_support_turn boolean;
  v_history_entry jsonb;
BEGIN
  FOR v_monitoria IN
    SELECT id, status, score, history
    FROM monitorias
    WHERE action_deadline_at < now()
      AND status NOT IN ('concluida', 'finalizada_alterada')
      AND active = true
  LOOP
    v_is_quality_turn := v_monitoria.status IN ('em_contestacao', 'aguardando_gestor_qualidade', 'reavaliacao_solicitada');
    v_is_support_turn := v_monitoria.status IN ('pendente_revisao', 'aguardando_gestor_suporte', 'contestacao_negada');

    IF NOT v_is_quality_turn AND NOT v_is_support_turn THEN CONTINUE; END IF;

    IF v_is_quality_turn THEN
      v_new_score := 100;
      v_note := 'Monitoria aprovada automaticamente (nota 100%) por perda de prazo da Equipe de Qualidade.';
    ELSE
      v_new_score := v_monitoria.score;
      v_note := 'Monitoria aprovada automaticamente por perda de prazo da Equipe de Suporte.';
    END IF;

    v_history_entry := jsonb_build_object(
      'action', 'Finalização Automática (Prazo)',
      'by_id', 'system',
      'by_name', 'Sistema Automático',
      'at', (now() AT TIME ZONE 'UTC')::text,
      'note', v_note
    );

    UPDATE monitorias
    SET status = 'concluida',
        score = v_new_score,
        resolution_type = 'automatic',
        updated_at = now(),
        history = COALESCE(history, '[]'::jsonb) || jsonb_build_array(v_history_entry)
    WHERE id = v_monitoria.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 10. Função calculate_action_deadline
-- =====================================================================
DROP FUNCTION IF EXISTS calculate_sla_deadline(timestamptz, numeric);
CREATE OR REPLACE FUNCTION calculate_action_deadline(
  p_start_time timestamp with time zone,
  p_action_hours numeric
) RETURNS timestamp with time zone AS $$
DECLARE
  v_deadline timestamp with time zone;
  v_remaining_hours numeric := p_action_hours;
  v_current_day date := p_start_time::date;
  v_start_of_day timestamp with time zone;
  v_end_of_day timestamp with time zone;
  v_hours_today numeric;
  v_bh record;
  v_is_holiday boolean;
BEGIN
  FOR i IN 1..100 LOOP
    SELECT EXISTS (SELECT 1 FROM holidays WHERE holiday_date = v_current_day) INTO v_is_holiday;
    IF NOT v_is_holiday THEN
      SELECT * INTO v_bh FROM business_hours WHERE day_of_week = EXTRACT(DOW FROM v_current_day);
      IF FOUND AND v_bh.is_open THEN
        v_start_of_day := v_current_day + v_bh.open_time;
        v_end_of_day := v_current_day + v_bh.close_time;
        IF p_start_time > v_start_of_day AND i = 1 THEN
          v_start_of_day := p_start_time;
        END IF;
        IF v_start_of_day < v_end_of_day THEN
          v_hours_today := EXTRACT(EPOCH FROM (v_end_of_day - v_start_of_day)) / 3600;
          IF v_remaining_hours <= v_hours_today THEN
            v_deadline := v_start_of_day + (v_remaining_hours * interval '1 hour');
            RETURN v_deadline;
          ELSE
            v_remaining_hours := v_remaining_hours - v_hours_today;
          END IF;
        END IF;
      END IF;
    END IF;
    v_current_day := v_current_day + interval '1 day';
    p_start_time := v_current_day;
  END LOOP;
  RETURN p_start_time + (p_action_hours * interval '1 hour');
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================================
-- 11. Trigger updated_at para monitorias e quality_configs
-- =====================================================================
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monitorias_updated_at ON public.monitorias;
CREATE TRIGGER trg_monitorias_updated_at BEFORE UPDATE ON public.monitorias FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_quality_configs_updated_at ON public.quality_configs;
CREATE TRIGGER trg_quality_configs_updated_at BEFORE UPDATE ON public.quality_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================================
-- 12. Popular colunas snapshot de nomes
-- =====================================================================
UPDATE public.monitorias m SET evaluator_name = u.name FROM public.users u WHERE u.id = m.evaluator_id AND m.evaluator_name IS NULL;
UPDATE public.monitorias m SET evaluated_name = u.name FROM public.users u WHERE u.id = m.evaluated_id AND m.evaluated_name IS NULL;
UPDATE public.monitorias m SET form_name = f.title FROM public.forms f WHERE f.id = m.form_id AND m.form_name IS NULL;
UPDATE public.monitorias m SET team_name = t.name FROM public.teams t WHERE t.id = m.team_id AND m.team_name IS NULL;

-- =====================================================================
-- 13. config_version em quality_configs
-- =====================================================================
ALTER TABLE public.quality_configs ADD COLUMN IF NOT EXISTS config_version INTEGER DEFAULT 1;

-- =====================================================================
-- 14. Remover coluna team_ids (substituída por user_teams)
-- =====================================================================
ALTER TABLE public.users DROP COLUMN IF EXISTS team_ids;

-- =====================================================================
-- PRONTO! Após executar, recarregue a página do app.
-- Para ativar o cron de auto-finalização, descomente e execute:
--   SELECT cron.unschedule('process-sla-timeouts');
--   SELECT cron.schedule('process-action-deadline', '*/5 * * * *', 'SELECT process_action_deadline_timeouts();');
-- =====================================================================
