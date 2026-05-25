-- =================================================================
-- M7: RLS para tabelas restantes (users, teams, forms,
-- access_requests, critical_criteria, quality_configs,
-- dissatisfaction_fields, user_teams, business_hours, holidays)
-- =================================================================

-- -----------------------------------------------------------------
-- users
-- -----------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "users_admin_write" ON public.users
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade','gestor_suporte'))
  );

-- -----------------------------------------------------------------
-- teams
-- -----------------------------------------------------------------
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select" ON public.teams
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "teams_admin_write" ON public.teams
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- -----------------------------------------------------------------
-- forms
-- -----------------------------------------------------------------
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forms_select" ON public.forms
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "forms_admin_write" ON public.forms
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
  );

-- -----------------------------------------------------------------
-- access_requests
-- -----------------------------------------------------------------
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_requests_insert" ON public.access_requests
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "access_requests_admin_read" ON public.access_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade','gestor_suporte'))
  );

CREATE POLICY "access_requests_admin_write" ON public.access_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
  );

-- -----------------------------------------------------------------
-- critical_criteria
-- -----------------------------------------------------------------
ALTER TABLE public.critical_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "critical_criteria_select" ON public.critical_criteria
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "critical_criteria_admin_write" ON public.critical_criteria
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
);

-- -----------------------------------------------------------------
-- quality_configs
-- -----------------------------------------------------------------
ALTER TABLE public.quality_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quality_configs_select" ON public.quality_configs
FOR SELECT TO authenticated USING (true);

CREATE POLICY "quality_configs_admin_write" ON public.quality_configs
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
);

-- -----------------------------------------------------------------
-- dissatisfaction_fields
-- -----------------------------------------------------------------
ALTER TABLE public.dissatisfaction_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dissatisfaction_fields_select" ON public.dissatisfaction_fields
FOR SELECT TO authenticated USING (true);

CREATE POLICY "dissatisfaction_fields_admin_write" ON public.dissatisfaction_fields
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','gestor_qualidade'))
);
