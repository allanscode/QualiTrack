-- =================================================================
-- M2: RLS monitorias v2 — sem casts ::text (colunas agora são UUID)
-- =================================================================

ALTER TABLE public.monitorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monitorias_select_policy" ON public.monitorias;
DROP POLICY IF EXISTS "monitorias_insert_policy" ON public.monitorias;
DROP POLICY IF EXISTS "monitorias_update_policy" ON public.monitorias;
DROP POLICY IF EXISTS "monitorias_delete_policy" ON public.monitorias;

-- SELECT: cada role vê apenas o que lhe compete
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
          AND monitorias.team_id = ANY(users.team_ids)
        )
      )
  )
);

-- INSERT: apenas qualidade, gestor_qualidade e admin
CREATE POLICY "monitorias_insert_policy" ON public.monitorias
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.active = true
      AND users.role IN ('admin', 'gestor_qualidade', 'qualidade')
  )
);

-- UPDATE: mesmas regras de leitura
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
          AND monitorias.team_id = ANY(users.team_ids)
        )
      )
  )
);

-- DELETE: apenas admin
CREATE POLICY "monitorias_delete_policy" ON public.monitorias
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.active = true
      AND users.role = 'admin'
  )
);
