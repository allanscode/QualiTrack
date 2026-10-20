CREATE TABLE IF NOT EXISTS public.system_maintenance (
  id integer PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  blocked_roles text[] NOT NULL DEFAULT '{}',
  expected_duration_minutes integer NOT NULL DEFAULT 60 CHECK (expected_duration_minutes BETWEEN 1 AND 10080),
  expected_return_at timestamptz,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_maintenance_allowed_roles CHECK (blocked_roles <@ ARRAY['gestor_suporte','gestor_qualidade','qualidade','suporte']::text[])
);

INSERT INTO public.system_maintenance (id, enabled, blocked_roles, expected_duration_minutes)
VALUES (1, false, '{}', 60)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_maintenance ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.system_maintenance TO authenticated;

DROP POLICY IF EXISTS system_maintenance_read_authenticated ON public.system_maintenance;
CREATE POLICY system_maintenance_read_authenticated ON public.system_maintenance
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS system_maintenance_admin_insert ON public.system_maintenance;
CREATE POLICY system_maintenance_admin_insert ON public.system_maintenance
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS system_maintenance_admin_update ON public.system_maintenance;
CREATE POLICY system_maintenance_admin_update ON public.system_maintenance
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS trg_system_maintenance_updated_at ON public.system_maintenance;
CREATE TRIGGER trg_system_maintenance_updated_at
  BEFORE UPDATE ON public.system_maintenance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
