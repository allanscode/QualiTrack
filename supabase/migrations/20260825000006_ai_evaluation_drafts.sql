-- =================================================================
-- ai_evaluation_drafts — resultado da IA salvo temporariamente por
-- ticket, até o monitor revisar e lançar (ou descartar) a monitoria
--
-- Sintoma: toda vez que o monitor voltava no mesmo ticket da Fila de
-- Positivas, precisava clicar em "Avaliar com IA" de novo — reenviando
-- a transcrição e refazendo a chamada à API (tempo + tokens gastos à
-- toa quando ele só queria revisar o que já tinha visto antes).
--
-- Decisão: uma linha por ticket_id (UNIQUE), sobrescrita a cada nova
-- avaliação rodada pra aquele ticket. O front busca o rascunho já
-- pronto antes de mostrar o botão "Avaliar com IA"; se existir, mostra
-- "Lançar Monitoria" (abre a ficha direto com o resultado salvo, sem
-- chamada à IA) + opção de reavaliar. Ao lançar a monitoria de fato,
-- o rascunho é apagado (vira monitoria de verdade, não precisa mais
-- do cache).
--
-- RLS: mesmo grupo de papéis que acessa a Central de Filas (todos
-- exceto 'suporte', ver App.tsx) — dado de rascunho de trabalho, não
-- é dado sensível de terceiro.
-- =================================================================

CREATE TABLE IF NOT EXISTS public.ai_evaluation_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL UNIQUE,
  form_id UUID REFERENCES public.forms(id) ON DELETE SET NULL,
  agent_name TEXT,
  agent_email TEXT,
  agent_id UUID,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  channel TEXT,
  satisfaction_comment TEXT,
  result JSONB NOT NULL,
  guideline_ids UUID[] DEFAULT '{}',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_evaluation_drafts_ticket_idx
  ON public.ai_evaluation_drafts (ticket_id);

ALTER TABLE public.ai_evaluation_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_drafts_select_policy" ON public.ai_evaluation_drafts;
CREATE POLICY "ai_drafts_select_policy" ON public.ai_evaluation_drafts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.active = true
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade', 'gestor_suporte')
    )
  );

DROP POLICY IF EXISTS "ai_drafts_write_policy" ON public.ai_evaluation_drafts;
CREATE POLICY "ai_drafts_write_policy" ON public.ai_evaluation_drafts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.active = true
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade', 'gestor_suporte')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.active = true
        AND users.role IN ('admin', 'gestor_qualidade', 'qualidade', 'gestor_suporte')
    )
  );

CREATE OR REPLACE FUNCTION public.set_ai_drafts_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_drafts_updated_at ON public.ai_evaluation_drafts;
CREATE TRIGGER ai_drafts_updated_at
  BEFORE UPDATE ON public.ai_evaluation_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_drafts_updated_at();

NOTIFY pgrst, 'reload schema';
