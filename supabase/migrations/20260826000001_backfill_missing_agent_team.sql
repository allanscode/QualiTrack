-- Backfill de equipe para agentes já cadastrados (inclusive contas
-- provisórias) que ficaram sem `primary_team_id` -- contas criadas antes do
-- "Importar do Zendesk" preencher public.teams, ou cadastradas manualmente
-- sem selecionar equipe. A partir de agora esse vínculo é completado
-- automaticamente (Edge Function helpdesk-queue: resolveOrCreateAgent, ao
-- puxar o grupo do ticket no Zendesk, e a nova ação backfill_agent_team, ao
-- salvar qualquer monitoria) -- esta migração é o backfill único para quem
-- já estava com o vínculo faltando ANTES dessa correção.
--
-- Fonte da equipe correta: a monitoria mais recente de cada agente que já
-- tem team_id preenchido -- reflete a equipe em que ele já foi avaliado de
-- verdade, é a mesma informação que o monitor via na ficha na hora de
-- avaliar. Nunca sobrescreve quem já tem primary_team_id definido.

WITH latest_team_by_agent AS (
  SELECT DISTINCT ON (m.evaluated_id)
    m.evaluated_id,
    m.team_id
  FROM public.monitorias m
  WHERE m.team_id IS NOT NULL
    AND m.evaluated_id IS NOT NULL
    AND m.active IS NOT FALSE
  ORDER BY m.evaluated_id, m.created_at DESC
)
UPDATE public.users u
SET primary_team_id = lta.team_id
FROM latest_team_by_agent lta
WHERE u.id = lta.evaluated_id
  AND u.primary_team_id IS NULL;

-- Espelha em user_teams (fonte de verdade para multi-equipe) todo mundo que
-- ficou com primary_team_id preenchido (pelo update acima ou já antes) mas
-- ainda não tinha o vínculo correspondente na tabela.
INSERT INTO public.user_teams (user_id, team_id)
SELECT u.id, u.primary_team_id
FROM public.users u
WHERE u.primary_team_id IS NOT NULL
ON CONFLICT (user_id, team_id) DO NOTHING;
