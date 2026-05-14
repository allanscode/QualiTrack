-- =========================================================================================
-- 1. LIMPEZA DOS DADOS DE TESTE (CUIDADO)
-- Vamos apagar os dados da tabela `users` atual (já que não estão em produção real)
-- E deletar eventuais usuários criados manualmente no Auth.
-- =========================================================================================

DELETE FROM public.users;

-- =========================================================================================
-- 2. CRIAÇÃO DO ADMINISTRADOR PADRÃO DIRETAMENTE NO SUPABASE AUTH
-- Isso criará o usuário qualidade@webposto.com.br no sistema seguro (auth.users)
-- A senha inicial será: Admin123!
-- =========================================================================================

-- Ativar extensão de criptografia caso não esteja ativa
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    new_user_id UUID := gen_random_uuid();
BEGIN
    -- Se o usuário já existir, apaga para garantir uma recriação limpa
    DELETE FROM auth.users WHERE email = 'qualidade@webposto.com.br';

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
        recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, 
        created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', 'qualidade@webposto.com.br', 
        crypt('Admin123!', gen_salt('bf')), now(), 
        null, null, '{"provider": "email", "providers": ["email"]}', '{"name": "Admin Qualidade"}', 
        now(), now(), '', '', '', ''
    );

    -- =========================================================================================
    -- 3. VÍNCULO COM A TABELA PÚBLICA DE USUÁRIOS
    -- Agora pegamos o ID gerado pelo Supabase Auth e inserimos na sua tabela customizada
    -- com os dados de acesso completo.
    -- =========================================================================================

    INSERT INTO public.users (
        id, email, name, role, active, created_at
    ) VALUES (
        new_user_id, 
        'qualidade@webposto.com.br', 
        'Administrador de Qualidade', 
        'gestor_qualidade', 
        true, 
        now()
    );
END $$;
