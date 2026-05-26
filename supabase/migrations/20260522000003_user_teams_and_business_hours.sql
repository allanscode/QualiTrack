-- =================================================================
-- M3: user_teams, business_hours, holidays
-- =================================================================

-- -----------------------------------------------------------------
-- P6: Criar tabela user_teams (N:N Users ↔ Teams)
-- -----------------------------------------------------------------
CREATE TABLE public.user_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_user_team UNIQUE (user_id, team_id)
);

CREATE INDEX idx_user_teams_user ON public.user_teams(user_id);
CREATE INDEX idx_user_teams_team ON public.user_teams(team_id);

-- Popular a partir de team_ids existente
INSERT INTO public.user_teams (user_id, team_id)
SELECT u.id, unnest(u.team_ids)
FROM public.users u
WHERE u.team_ids IS NOT NULL
  AND array_length(u.team_ids, 1) > 0
ON CONFLICT DO NOTHING;

-- RLS para user_teams
ALTER TABLE public.user_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_teams_select" ON public.user_teams
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "user_teams_insert" ON public.user_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade','gestor_suporte'))
  );

CREATE POLICY "user_teams_delete" ON public.user_teams
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade','gestor_suporte'))
  );

-- -----------------------------------------------------------------
-- P7: Criar tabelas business_hours e holidays
-- -----------------------------------------------------------------
CREATE TABLE public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week SMALLINT NOT NULL UNIQUE CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT true,
  open_time TIME NOT NULL DEFAULT '08:00',
  close_time TIME NOT NULL DEFAULT '17:00'
);

CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL UNIQUE,
  description TEXT
);

-- Seed: horário padrão seg–sex 08:00–17:00
INSERT INTO public.business_hours (day_of_week, is_open, open_time, close_time) VALUES
  (0, false, '00:00', '00:00'),
  (1, true,  '08:00', '17:00'),
  (2, true,  '08:00', '17:00'),
  (3, true,  '08:00', '17:00'),
  (4, true,  '08:00', '17:00'),
  (5, true,  '08:00', '17:00'),
  (6, false, '00:00', '00:00');

-- Seed: feriados nacionais BR 2026
INSERT INTO public.holidays (holiday_date, description) VALUES
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-09-07', 'Independência do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-12-25', 'Natal');

-- RLS para business_hours
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bh_select" ON public.business_hours
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "bh_admin" ON public.business_hours
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
  );

-- RLS para holidays
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holidays_select" ON public.holidays
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "holidays_admin" ON public.holidays
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
  );
