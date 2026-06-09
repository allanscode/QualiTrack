-- Adição de índice para team_id em monitorias
-- Recomendado pelo relatório de auditoria para acelerar queries por gestores de suporte

CREATE INDEX IF NOT EXISTS idx_monitorias_team_id_active 
ON public.monitorias(team_id) 
WHERE active = true;
