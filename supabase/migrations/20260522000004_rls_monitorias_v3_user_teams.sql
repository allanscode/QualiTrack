-- =================================================================
-- M4: RLS monitorias v3 — gestor_suporte usa user_teams
-- =================================================================

DROP POLICY IF EXISTS "monitorias_select_policy" ON public.monitorias;
DROP POLICY IF EXISTS "monitorias_update_policy" ON public.monitorias;

-- SELECT: gestor_suporte agora consulta user_teams em vez de team_ids
CREATE POLICY "monitorias_select_policy" ON public.monitorias
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.active = true
      AND (
        users.role = 'admin'
        OR users.role = 'gestor_qualidade'
        OR (users.role = 'suporte' AND monitorias.evaluated_id = auth.uid())
        OR (users.role = 'qualidade' AND monitorias.evaluator_id = auth.uid())
        OR (
          users.role = 'gestor_suporte'
          AND EXISTS (
            SELECT 1 FROM public.user_teams
            WHERE user_teams.user_id = users.id
              AND user_teams.team_id = monitorias.team_id
          )
        )
      )
  )
);

-- UPDATE: mesma lógica com user_teams
CREATE POLICY "monitorias_update_policy" ON public.monitorias
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.active = true
      AND (
        users.role = 'admin'
        OR users.role = 'gestor_qualidade'
        OR (users.role = 'suporte' AND monitorias.evaluated_id = auth.uid())
        OR (users.role = 'qualidade' AND monitorias.evaluator_id = auth.uid())
        OR (
          users.role = 'gestor_suporte'
          AND EXISTS (
            SELECT 1 FROM public.user_teams
            WHERE user_teams.user_id = users.id
              AND user_teams.team_id = monitorias.team_id
          )
        )
      )
  )
);
