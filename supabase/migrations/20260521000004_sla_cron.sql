-- Arquivo: supabase_sla_cron.sql
-- Descrição: Função PL/pgSQL e job agendado via pg_cron para processar a perda de prazo (SLA) das monitorias no servidor do Supabase.
--
-- NOTA IMPORTANTE SOBRE A LÓGICA DE DEADLINE:
-- Esta função usa `deadline_at < now()` como critério de vencimento. Isso é correto porque
-- o campo `deadline_at` já é calculado pelo frontend usando `addBusinessHours()` (em
-- src/lib/businessHours.ts), que respeita horário comercial, fins de semana e feriados.
-- O deadline é salvo em UTC no banco, portanto uma comparação simples com `now()` é suficiente.
-- NÃO tente recalcular o deadline aqui — confie no valor já persistido.
-- Se a lógica de cálculo de deadline for alterada no frontend, as monitorias existentes
-- precisarão ter seus deadlines recalculados via `recalculateActiveDeadlines()`.

-- 1. Criação da Função de Processamento
CREATE OR REPLACE FUNCTION process_sla_timeouts()
RETURNS void AS $$
DECLARE
  v_monitoria RECORD;
  v_new_score numeric;
  v_note text;
  v_is_quality_turn boolean;
  v_is_support_turn boolean;
  v_history_entry jsonb;
BEGIN
  -- Percorre todas as monitorias ativas, com prazo vencido e que não estão finalizadas
  FOR v_monitoria IN 
    SELECT id, status, score, history 
    FROM monitorias 
    WHERE deadline_at < now() 
      AND status NOT IN ('concluida', 'finalizada_alterada')
      AND active = true
  LOOP
    
    -- Verifica de quem é a posse atual da monitoria com base no status
    v_is_quality_turn := v_monitoria.status IN ('em_contestacao', 'aguardando_gestor_qualidade', 'reavaliacao_solicitada');
    v_is_support_turn := v_monitoria.status IN ('pendente_revisao', 'aguardando_gestor_suporte', 'contestacao_negada');

    -- Se por acaso estiver em um status desconhecido, ignora
    IF NOT v_is_quality_turn AND NOT v_is_support_turn THEN
      CONTINUE;
    END IF;

    -- Aplica as regras de negócio de SLA
    IF v_is_quality_turn THEN
      v_new_score := 100;
      v_note := 'Monitoria aprovada automaticamente (nota 100%) por perda de prazo da Equipe de Qualidade.';
    ELSE
      v_new_score := v_monitoria.score;
      v_note := 'Monitoria aprovada automaticamente por perda de prazo da Equipe de Suporte.';
    END IF;

    -- Constrói a nova entrada de histórico no formato JSONB
    v_history_entry := jsonb_build_object(
      'action', 'Finalização Automática (SLA)',
      'by_id', 'system',
      'by_name', 'Sistema Automático',
      'at', (now() AT TIME ZONE 'UTC')::text,
      'note', v_note
    );

    -- Executa o UPDATE seguro no banco
    UPDATE monitorias 
    SET 
      status = 'concluida',
      score = v_new_score,
      updated_at = now(),
      -- Se history for nulo, transforma em array vazio e então adiciona o novo objeto
      history = COALESCE(history, '[]'::jsonb) || jsonb_build_array(v_history_entry)
    WHERE id = v_monitoria.id;

  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. Agendamento do Job (pg_cron)
-- IMPORTANTE: Para rodar este comando, certifique-se de habilitar a extensão pg_cron 
-- no menu "Database > Extensions" do painel do seu Supabase.
-- ==============================================================================

-- Remover job anterior (se existir) para evitar duplicidade
-- SELECT cron.unschedule('process-sla-timeouts');

-- Agendar para rodar a cada 5 minutos
-- SELECT cron.schedule('process-sla-timeouts', '*/5 * * * *', 'SELECT process_sla_timeouts();');
