-- Migration: 20260926000001_create_agent_feedbacks.sql
-- Description: Módulo de Feedbacks & PDI (1:1) entre gestores e atendentes

CREATE TABLE IF NOT EXISTS public.agent_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  monitoria_id uuid REFERENCES public.monitorias(id) ON DELETE SET NULL,
  title text NOT NULL,
  strengths text,
  improvements text NOT NULL,
  action_plan text NOT NULL,
  deadline_date date,
  status text NOT NULL DEFAULT 'pendente_ciencia' CHECK (status IN ('pendente_ciencia', 'ciente', 'concluido')),
  agent_acknowledged_at timestamptz,
  agent_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_agent_feedbacks_agent_id ON public.agent_feedbacks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedbacks_manager_id ON public.agent_feedbacks(manager_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedbacks_team_id ON public.agent_feedbacks(team_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedbacks_status ON public.agent_feedbacks(status);

-- RLS
ALTER TABLE public.agent_feedbacks ENABLE ROW LEVEL SECURITY;

-- 1. Leitura:
DROP POLICY IF EXISTS "agent_feedbacks_select_policy" ON public.agent_feedbacks;
CREATE POLICY "agent_feedbacks_select_policy" ON public.agent_feedbacks
FOR SELECT TO authenticated
USING (
  agent_id = (SELECT auth.uid())
  OR manager_id = (SELECT auth.uid())
  OR _private.is_admin_user()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.active = true
      AND (
        u.role = 'gestor_qualidade'
        OR (
          u.role = 'gestor_suporte' AND (
            team_id IS NULL OR EXISTS (
              SELECT 1 FROM public.user_teams ut
              WHERE ut.user_id = u.id AND ut.team_id = agent_feedbacks.team_id
            )
          )
        )
      )
  )
);

-- 2. Criação:
DROP POLICY IF EXISTS "agent_feedbacks_insert_policy" ON public.agent_feedbacks;
CREATE POLICY "agent_feedbacks_insert_policy" ON public.agent_feedbacks
FOR INSERT TO authenticated
WITH CHECK (
  _private.is_admin_user()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.active = true
      AND u.role IN ('admin', 'gestor_qualidade', 'gestor_suporte')
  )
);

-- 3. Atualização:
DROP POLICY IF EXISTS "agent_feedbacks_update_policy" ON public.agent_feedbacks;
CREATE POLICY "agent_feedbacks_update_policy" ON public.agent_feedbacks
FOR UPDATE TO authenticated
USING (
  manager_id = (SELECT auth.uid())
  OR agent_id = (SELECT auth.uid())
  OR _private.is_admin_user()
)
WITH CHECK (
  manager_id = (SELECT auth.uid())
  OR agent_id = (SELECT auth.uid())
  OR _private.is_admin_user()
);

NOTIFY pgrst, 'reload schema';
