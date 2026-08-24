-- =================================================================
-- helpdesk_submissions — histórico de envios ao helpdesk (Zendesk e
-- futuros providers)
--
-- Sintoma: não existe hoje nenhum registro de que uma monitoria foi
-- publicada num ticket de helpdesk, nem de falhas de publicação. A
-- tela de monitoria não tem como responder "já foi enviado?" ou
-- "por que falhou?" sem consultar a API externa a cada carregamento.
--
-- Causa: a integração com helpdesk (Fase 1: Zendesk) é nova — a
-- Edge Function `helpdesk-publish-evaluation` precisa de um lugar
-- para registrar cada tentativa (sucesso e falha) por monitoria.
--
-- Decisão: tabela dedicada, não coluna em `monitorias`. Uma monitoria
-- pode ter múltiplas tentativas de envio (ex.: falha e retentativa);
-- o histórico completo fica em `helpdesk_submissions`, e é ela que
-- responde às perguntas acima. `provider` e `external_ticket_id`
-- (TEXT, não BIGINT) mantêm a tabela neutra em relação ao helpdesk —
-- outros providers usam IDs não numéricos.
--
-- RLS: leitura liberada para quem já enxerga a monitoria correspondente
-- (mesma regra de `monitorias_select_policy`, ver
-- 20260609000001_security_audit_rls.sql). Escrita não tem policy
-- própria: só a service role grava, e a service role sempre contorna
-- RLS no Supabase — não é preciso (nem desejável) expor INSERT/UPDATE
-- a usuários autenticados.
-- =================================================================

CREATE TABLE IF NOT EXISTS public.helpdesk_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoria_id UUID NOT NULL REFERENCES public.monitorias(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'zendesk',
  external_ticket_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('positiva', 'negativa')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  external_comment_id TEXT,
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS helpdesk_submissions_monitoria_idx
  ON public.helpdesk_submissions (monitoria_id, created_at DESC);

ALTER TABLE public.helpdesk_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "helpdesk_submissions_select_policy" ON public.helpdesk_submissions;

CREATE POLICY "helpdesk_submissions_select_policy" ON public.helpdesk_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.monitorias
      JOIN public.users ON users.id = (SELECT auth.uid())
      WHERE monitorias.id = helpdesk_submissions.monitoria_id
        AND users.active = true
        AND (
          users.role = 'admin'
          OR users.role = 'gestor_qualidade'
          OR (users.role = 'suporte' AND monitorias.evaluated_id = (SELECT auth.uid()))
          OR (users.role = 'qualidade' AND monitorias.evaluator_id = (SELECT auth.uid()))
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

NOTIFY pgrst, 'reload schema';
