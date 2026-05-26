-- =================================================================
-- M6: Renomear SLA → Prazo de Ação (coluna + funções SQL)
-- =================================================================

-- Renomear coluna deadline_at → action_deadline_at
ALTER TABLE public.monitorias RENAME COLUMN deadline_at TO action_deadline_at;

-- Renomear índice (se existir)
DROP INDEX IF EXISTS idx_monitorias_deadline;
CREATE INDEX idx_monitorias_action_deadline ON public.monitorias(action_deadline_at)
  WHERE status NOT IN ('concluida','finalizada_alterada') AND active = true;

-- Recriar função process_sla_timeouts → process_action_deadline_timeouts
DROP FUNCTION IF EXISTS process_sla_timeouts();

CREATE OR REPLACE FUNCTION process_action_deadline_timeouts()
RETURNS void AS $$
DECLARE
  v_monitoria RECORD;
  v_new_score numeric;
  v_note text;
  v_is_quality_turn boolean;
  v_is_support_turn boolean;
  v_history_entry jsonb;
BEGIN
  FOR v_monitoria IN
    SELECT id, status, score, history
    FROM monitorias
    WHERE action_deadline_at < now()
      AND status NOT IN ('concluida', 'finalizada_alterada')
      AND active = true
  LOOP
    v_is_quality_turn := v_monitoria.status IN ('em_contestacao', 'aguardando_gestor_qualidade', 'reavaliacao_solicitada');
    v_is_support_turn := v_monitoria.status IN ('pendente_revisao', 'aguardando_gestor_suporte', 'contestacao_negada');

    IF NOT v_is_quality_turn AND NOT v_is_support_turn THEN
      CONTINUE;
    END IF;

    IF v_is_quality_turn THEN
      v_new_score := 100;
      v_note := 'Monitoria aprovada automaticamente (nota 100%) por perda de prazo da Equipe de Qualidade.';
    ELSE
      v_new_score := v_monitoria.score;
      v_note := 'Monitoria aprovada automaticamente por perda de prazo da Equipe de Suporte.';
    END IF;

    v_history_entry := jsonb_build_object(
      'action', 'Finalização Automática (Prazo)',
      'by_id', 'system',
      'by_name', 'Sistema Automático',
      'at', (now() AT TIME ZONE 'UTC')::text,
      'note', v_note
    );

    UPDATE monitorias
    SET
      status = 'concluida',
      score = v_new_score,
      resolution_type = 'automatic',
      updated_at = now(),
      history = COALESCE(history, '[]'::jsonb) || jsonb_build_array(v_history_entry)
    WHERE id = v_monitoria.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Recriar função calculate_sla_deadline → calculate_action_deadline
DROP FUNCTION IF EXISTS calculate_sla_deadline(timestamptz, numeric);

CREATE OR REPLACE FUNCTION calculate_action_deadline(
  p_start_time timestamp with time zone,
  p_action_hours numeric
) RETURNS timestamp with time zone AS $$
DECLARE
  v_deadline timestamp with time zone;
  v_remaining_hours numeric := p_action_hours;
  v_current_day date := p_start_time::date;
  v_start_of_day timestamp with time zone;
  v_end_of_day timestamp with time zone;
  v_hours_today numeric;
  v_bh record;
  v_is_holiday boolean;
BEGIN
  FOR i IN 1..100 LOOP
    SELECT EXISTS (
      SELECT 1 FROM holidays WHERE holiday_date = v_current_day
    ) INTO v_is_holiday;

    IF NOT v_is_holiday THEN
      SELECT * INTO v_bh
      FROM business_hours
      WHERE day_of_week = EXTRACT(DOW FROM v_current_day);

      IF FOUND AND v_bh.is_open THEN
        v_start_of_day := v_current_day + v_bh.open_time;
        v_end_of_day := v_current_day + v_bh.close_time;

        IF p_start_time > v_start_of_day AND i = 1 THEN
          v_start_of_day := p_start_time;
        END IF;

        IF v_start_of_day < v_end_of_day THEN
          v_hours_today := EXTRACT(EPOCH FROM (v_end_of_day - v_start_of_day)) / 3600;

          IF v_remaining_hours <= v_hours_today THEN
            v_deadline := v_start_of_day + (v_remaining_hours * interval '1 hour');
            RETURN v_deadline;
          ELSE
            v_remaining_hours := v_remaining_hours - v_hours_today;
          END IF;
        END IF;
      END IF;
    END IF;

    v_current_day := v_current_day + interval '1 day';
    p_start_time := v_current_day;
  END LOOP;

  RETURN p_start_time + (p_action_hours * interval '1 hour');
END;
$$ LANGUAGE plpgsql STABLE;

-- Atualizar pg_cron job (se existir) — descomente para executar:
-- SELECT cron.unschedule('process-sla-timeouts');
-- SELECT cron.schedule('process-action-deadline', '*/5 * * * *', 'SELECT process_action_deadline_timeouts();');
