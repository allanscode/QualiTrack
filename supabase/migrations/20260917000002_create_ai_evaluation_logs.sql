-- Migration: 20260917000002_create_ai_evaluation_logs.sql
-- Tabela para rastreabilidade e auditoria das execuções de IA (acesso exclusivo admin)

CREATE TABLE IF NOT EXISTS public.ai_evaluation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id TEXT NOT NULL,
    ticket_subject TEXT,
    evaluation_type TEXT NOT NULL DEFAULT 'atendimento', -- 'atendimento' | 'chamado_filho'
    provider TEXT NOT NULL,                             -- 'gemini' | 'openrouter'
    model TEXT NOT NULL,                                -- ex: 'gemini-3.6-flash'
    duration_ms INTEGER,                                -- tempo de resposta em ms
    prompt_text TEXT,                                   -- prompt montado completo
    sanitized_dialogue TEXT,                            -- transcrição após filtro sanitizador
    response_json JSONB,                                -- JSON estruturado retornado pela IA
    status TEXT NOT NULL,                               -- 'success' | 'error'
    error_message TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de performance para busca rápida
CREATE INDEX IF NOT EXISTS idx_ai_eval_logs_ticket ON public.ai_evaluation_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ai_eval_logs_created_at ON public.ai_evaluation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_eval_logs_type ON public.ai_evaluation_logs(evaluation_type);

-- Habilita RLS
ALTER TABLE public.ai_evaluation_logs ENABLE ROW LEVEL SECURITY;

-- Política de Leitura: EXCLUSIVA para Administradores
DROP POLICY IF EXISTS "Admins can view ai_evaluation_logs" ON public.ai_evaluation_logs;
CREATE POLICY "Admins can view ai_evaluation_logs"
    ON public.ai_evaluation_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Política de Escrita: Usuários autenticados (ou Edge Functions)
DROP POLICY IF EXISTS "Authenticated can insert ai_evaluation_logs" ON public.ai_evaluation_logs;
CREATE POLICY "Authenticated can insert ai_evaluation_logs"
    ON public.ai_evaluation_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
