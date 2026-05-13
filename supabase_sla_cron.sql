-- Ativar a extensão pg_cron (caso ainda não esteja ativa no projeto Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Função para processar monitorias com prazo vencido
CREATE OR REPLACE FUNCTION process_sla_timeouts()
RETURNS void AS $$
DECLARE
    m RECORD;
    is_quality_turn BOOLEAN;
    is_support_turn BOOLEAN;
    new_score NUMERIC;
    action_note TEXT;
    history_entry JSONB;
BEGIN
    -- Seleciona todas as monitorias ativas, não concluídas e com prazo estourado
    FOR m IN 
        SELECT id, status, score, history 
        FROM public.monitorias 
        WHERE active = true 
          AND deadline_at < NOW()
          AND status NOT IN ('concluida', 'finalizada_alterada', 'contestacao_aceita', 'contestacao_negada')
    LOOP
        -- Identifica de quem era a 'posse' da monitoria no momento do vencimento
        is_quality_turn := m.status IN ('em_contestacao', 'aguardando_gestor_qualidade', 'reavaliacao_solicitada');
        is_support_turn := m.status IN ('pendente_revisao', 'aguardando_gestor_suporte');

        -- Se não pertencer a nenhum dos fluxos mapeados com SLA, ignora
        IF NOT is_quality_turn AND NOT is_support_turn THEN
            CONTINUE;
        END IF;

        -- Regras de negócio conforme solicitação
        IF is_quality_turn THEN
            new_score := 100;
            action_note := 'Monitoria aprovada automaticamente (nota 100%) por perda de prazo da Equipe de Qualidade.';
        ELSE
            new_score := m.score;
            action_note := 'Monitoria aprovada automaticamente por perda de prazo da Equipe de Suporte.';
        END IF;

        -- Cria o objeto JSONB do histórico
        history_entry := jsonb_build_object(
            'action', 'Finalização Automática (SLA)',
            'by_id', 'system',
            'by_name', 'Sistema Automático',
            'at', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'note', action_note
        );

        -- Executa a atualização na tabela
        UPDATE public.monitorias
        SET 
            status = 'concluida',
            score = new_score,
            updated_at = NOW(),
            history = COALESCE(history, '[]'::jsonb) || jsonb_build_array(history_entry)
        WHERE id = m.id;

    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Agendar a função para rodar a cada 5 minutos
-- Limpa um agendamento anterior se existir, para evitar duplicação em execuções repetidas
SELECT cron.unschedule('process-sla-timeouts-job');
SELECT cron.schedule('process-sla-timeouts-job', '*/5 * * * *', 'SELECT process_sla_timeouts();');

-- Comentário: Para testar imediatamente, você pode rodar 'SELECT process_sla_timeouts();' no console SQL.
