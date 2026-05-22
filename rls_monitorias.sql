-- RLS (ROW LEVEL SECURITY) PARA A TABELA MONITORIAS
-- Executar no SQL Editor do Supabase Dashboard
-- IMPORTANTE: Execute este SQL manualmente no Supabase.
-- O mockDb (localStorage) nao e afetado por RLS.

-- 0. Ativar RLS na tabela monitorias
ALTER TABLE public.monitorias ENABLE ROW LEVEL SECURITY;

-- Remover policies existentes (se houver) para evitar conflito
DROP POLICY IF EXISTS "monitorias_select_policy" ON public.monitorias;
DROP POLICY IF EXISTS "monitorias_insert_policy" ON public.monitorias;
DROP POLICY IF EXISTS "monitorias_update_policy" ON public.monitorias;
DROP POLICY IF EXISTS "monitorias_delete_policy" ON public.monitorias;

-- 1. POLITICA DE LEITURA (SELECT)
-- Cada role ve apenas o que lhe compete:
--   suporte         -> monitorias onde evaluated_id = auth.uid()
--   qualidade       -> monitorias onde evaluator_id = auth.uid()
--   gestor_suporte  -> monitorias das equipes que gerencia (team_id IN user.team_ids)
--   gestor_qualidade-> todas as monitorias
--   admin           -> todas as monitorias

CREATE POLICY "monitorias_select_policy" ON public.monitorias
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id::uuid = auth.uid()
    AND users.active = true
    AND (
      users.role = 'admin'
      OR users.role = 'gestor_qualidade'
      OR (users.role = 'suporte' AND monitorias.evaluated_id::text = auth.uid()::text)
      OR (users.role = 'qualidade' AND monitorias.evaluator_id::text = auth.uid()::text)
      OR (
        users.role = 'gestor_suporte'
        AND monitorias.team_id::text = ANY(users.team_ids::text[])
      )
    )
  )
);

-- 2. POLITICA DE INSERCAO (INSERT)
-- Apenas qualidade, gestor_qualidade e admin podem criar monitorias

CREATE POLICY "monitorias_insert_policy" ON public.monitorias
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id::uuid = auth.uid()
    AND users.active = true
    AND users.role IN ('admin', 'gestor_qualidade', 'qualidade')
  )
);

-- 3. POLITICA DE ATUALIZACAO (UPDATE)
-- Mesmas regras de leitura: quem pode ver pode editar
-- (O frontend ja controla quais acoes cada role pode executar)

CREATE POLICY "monitorias_update_policy" ON public.monitorias
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id::uuid = auth.uid()
    AND users.active = true
    AND (
      users.role = 'admin'
      OR users.role = 'gestor_qualidade'
      OR (users.role = 'suporte' AND monitorias.evaluated_id::text = auth.uid()::text)
      OR (users.role = 'qualidade' AND monitorias.evaluator_id::text = auth.uid()::text)
      OR (
        users.role = 'gestor_suporte'
        AND monitorias.team_id::text = ANY(users.team_ids::text[])
      )
    )
  )
);

-- 4. POLITICA DE EXCLUSAO (DELETE)
-- Apenas admin pode excluir monitorias (soft-delete via active=false)

CREATE POLICY "monitorias_delete_policy" ON public.monitorias
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id::uuid = auth.uid()
    AND users.active = true
    AND users.role = 'admin'
  )
);
