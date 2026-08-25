-- =================================================================
-- Corrige RLS de ai_evaluation_guidelines: a policy de SELECT só
-- liberava para admin/gestor_qualidade, mas quem roda "Avaliar com
-- IA" na Central de Filas é o papel 'qualidade' (Monitor de
-- Qualidade) — o mesmo grupo que enxerga a aba "Filas de Triagem"
-- (todo mundo exceto 'suporte', ver App.tsx). Sem essa correção, o
-- popup de seleção de manual sempre aparecia vazio pra quem faz a
-- triagem no dia a dia.
--
-- Escrita (cadastrar/editar manuais) continua restrita a
-- admin/gestor_qualidade — é configuração, não uso diário.
-- =================================================================

DROP POLICY IF EXISTS "ai_guidelines_select_policy" ON public.ai_evaluation_guidelines;
CREATE POLICY "ai_guidelines_select_policy" ON public.ai_evaluation_guidelines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.active = true
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade', 'gestor_suporte')
    )
  );

NOTIFY pgrst, 'reload schema';
