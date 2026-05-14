-- =================================================================
-- CRIAÇÃO DA TABELA DE CONFIGURAÇÕES DE QUALIDADE (SLA, Metas, etc)
-- Isso resolve o erro 404 que estava aparecendo no F12
-- =================================================================

CREATE TABLE IF NOT EXISTS public.quality_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ativar RLS (Segurança)
ALTER TABLE public.quality_configs ENABLE ROW LEVEL SECURITY;

-- Permitir leitura para todos os usuários autenticados
CREATE POLICY "Permitir leitura de configs para todos logados" 
ON public.quality_configs FOR SELECT TO authenticated USING (true);

-- Permitir inserção/edição apenas para administradores
CREATE POLICY "Permitir edição de configs apenas para admins" 
ON public.quality_configs FOR ALL TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() 
        AND users.role IN ('admin', 'gestor_qualidade')
    )
);
