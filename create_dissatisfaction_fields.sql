-- =================================================================
-- CRIAÇÃO DA TABELA DE CAMPOS DINÂMICOS DE INSATISFAÇÃO E COLUNA
-- =================================================================

-- 1. Criar tabela de campos de insatisfação se não existir
CREATE TABLE IF NOT EXISTS public.dissatisfaction_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('cliente', 'qualidade')),
    options TEXT[] NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Adicionar coluna dissatisfaction_answers na tabela monitorias se não existir
ALTER TABLE public.monitorias ADD COLUMN IF NOT EXISTS dissatisfaction_answers JSONB DEFAULT '{}'::jsonb;

-- 3. Ativar RLS (Row Level Security) na nova tabela
ALTER TABLE public.dissatisfaction_fields ENABLE ROW LEVEL SECURITY;

-- 4. Criar política para leitura livre para qualquer usuário autenticado
DROP POLICY IF EXISTS "Permitir leitura de campos para todos logados" ON public.dissatisfaction_fields;
CREATE POLICY "Permitir leitura de campos para todos logados" 
ON public.dissatisfaction_fields 
FOR SELECT 
TO authenticated 
USING (true);

-- 5. Criar política para escrita (CRUD) exclusiva para administradores
DROP POLICY IF EXISTS "Permitir escrita de campos apenas para admins" ON public.dissatisfaction_fields;
CREATE POLICY "Permitir escrita de campos apenas para admins" 
ON public.dissatisfaction_fields 
FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() 
        AND users.role = 'admin'
    )
);
