-- =================================================================
-- Migração: Governança, Versões e Histórico de Manuais & Padrões
-- Permite que Monitores de Qualidade e Gestores de Qualidade proponham
-- edições de manuais e padrões de atendimento para verificação e
-- aprovação do Administrador, mantendo histórico de auditoria.
-- =================================================================

ALTER TABLE public.ai_evaluation_guidelines 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS pending_title TEXT,
  ADD COLUMN IF NOT EXISTS pending_content TEXT,
  ADD COLUMN IF NOT EXISTS pending_modified_by_name TEXT,
  ADD COLUMN IF NOT EXISTS pending_modified_by_role TEXT,
  ADD COLUMN IF NOT EXISTS pending_modified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Atualiza RLS de escrita para permitir 'qualidade', além de 'admin' e 'gestor_qualidade'
DROP POLICY IF EXISTS "ai_guidelines_write_policy" ON public.ai_evaluation_guidelines;
CREATE POLICY "ai_guidelines_write_policy" ON public.ai_evaluation_guidelines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.active = true
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade')
    )
  );

NOTIFY pgrst, 'reload schema';
