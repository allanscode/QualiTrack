-- =================================================================
-- Migração: Habilitar Realtime para Manuais & Padrões de IA
-- Permite que Administradores e Monitores de Qualidade recebam
-- atualizações e notificações instantâneas sobre propostas e aprovações.
-- =================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_evaluation_guidelines'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_evaluation_guidelines;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
