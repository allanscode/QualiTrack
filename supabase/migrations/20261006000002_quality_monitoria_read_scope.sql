-- Monitores de qualidade podem consultar o histórico completo de monitorias.
-- A alteração amplia somente SELECT; UPDATE continua restrito ao auditor da ficha.
DROP POLICY IF EXISTS "monitorias_select_policy" ON public.monitorias;
CREATE POLICY "monitorias_select_policy" ON public.monitorias FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.active
    AND (u.role IN ('admin', 'gestor_qualidade', 'qualidade')
      OR (u.role = 'gestor_suporte' AND EXISTS (
        SELECT 1 FROM public.user_teams ut WHERE ut.user_id = u.id AND ut.team_id = monitorias.team_id))))
);
