-- =================================================================
-- LIMPEZA SELETIVA — QualiTrack (Dados de Teste)
-- Mantém: 3 usuários específicos + todas as teams + quality_configs
-- Remove: TODAS monitorias, TODOS outros users, access_requests, user_teams, user_preferences
-- =================================================================

-- Usuários a PRESERVAR (não toque nestes emails)
-- gabriel.dias@webposto.com.br
-- qualidade@webposto.com.br
-- vinicius.gouvea@webposto.com.br

-- -----------------------------------------------------------------
-- 1. LIMPAR DADOS FILHOS (respeita FKs)
-- -----------------------------------------------------------------

-- Monitorias: TODAS (ativas e inativas)
DELETE FROM public.monitorias WHERE true;

-- Solicitações de acesso: TODAS (histórico de testes)
DELETE FROM public.access_requests WHERE true;

-- Ligações user_teams: TODAS (serão recriadas pros users mantidos)
DELETE FROM public.user_teams WHERE true;

-- Preferências de usuário: TODAS
DELETE FROM public.user_preferences WHERE true;

-- Campos extras de insatisfação: TODOS (dados de teste)
DELETE FROM public.dissatisfaction_fields WHERE true;

-- -----------------------------------------------------------------
-- 2. LIMPAR USUÁRIOS (exceto os 3 permitidos)
-- -----------------------------------------------------------------
DELETE FROM public.users
WHERE email NOT IN (
  'gabriel.dias@webposto.com.br',
  'qualidade@webposto.com.br',
  'vinicius.gouvea@webposto.com.br'
);

-- -----------------------------------------------------------------
-- 3. VERIFICAÇÃO PÓS-LIMPEZA
-- -----------------------------------------------------------------
SELECT 'monitorias' as tabela, count(*) as registros FROM public.monitorias
UNION ALL SELECT 'users', count(*) FROM public.users
UNION ALL SELECT 'access_requests', count(*) FROM public.access_requests
UNION ALL SELECT 'user_teams', count(*) FROM public.user_teams
UNION ALL SELECT 'user_preferences', count(*) FROM public.user_preferences
UNION ALL SELECT 'dissatisfaction_fields', count(*) FROM public.dissatisfaction_fields
UNION ALL SELECT 'teams (mantidas)', count(*) FROM public.teams
UNION ALL SELECT 'forms (mantidos)', count(*) FROM public.forms
UNION ALL SELECT 'quality_configs (mantidos)', count(*) FROM public.quality_configs;

-- Listar usuários restantes para confirmar
SELECT id, email, name, role, active, team_id
FROM public.users
ORDER BY email;