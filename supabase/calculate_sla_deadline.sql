-- Arquivo: supabase/calculate_sla_deadline.sql
-- Descrição: Função PL/pgSQL otimizada para o cálculo de prazo de SLA considerando 
--            horários comerciais e feriados, evitando overhead de processamento no pg_cron.

CREATE OR REPLACE FUNCTION calculate_sla_deadline(
    p_start_time timestamp with time zone,
    p_sla_hours numeric
) RETURNS timestamp with time zone AS $$
DECLARE
    v_deadline timestamp with time zone;
    v_remaining_hours numeric := p_sla_hours;
    v_current_day date := p_start_time::date;
    v_start_of_day timestamp with time zone;
    v_end_of_day timestamp with time zone;
    v_hours_today numeric;
    v_bh record;
    v_is_holiday boolean;
BEGIN
    -- Configuração limite de 100 dias úteis para evitar loops infinitos acidentais
    FOR i IN 1..100 LOOP
        
        -- 1. Verifica se o dia atual é feriado
        SELECT EXISTS (
            SELECT 1 FROM holidays WHERE holiday_date = v_current_day
        ) INTO v_is_holiday;

        -- 2. Se não for feriado, busca o horário de funcionamento para o dia da semana atual
        IF NOT v_is_holiday THEN
            -- day_of_week: Extrator do PG. 0=Domingo, 1=Segunda, etc.
            SELECT * INTO v_bh 
            FROM business_hours 
            WHERE day_of_week = EXTRACT(DOW FROM v_current_day);

            -- Se encontrar configuração de horas pro dia e estiver "open"
            IF FOUND AND v_bh.is_open THEN
                -- Define o início e fim do expediente para o dia atual com fuso horário da inserção
                v_start_of_day := v_current_day + v_bh.open_time;
                v_end_of_day := v_current_day + v_bh.close_time;

                -- Ajusta o início se for o primeiro dia da contagem e a task começou após a abertura
                IF p_start_time > v_start_of_day AND i = 1 THEN
                    v_start_of_day := p_start_time;
                END IF;

                -- Se ainda houver período válido hoje
                IF v_start_of_day < v_end_of_day THEN
                    v_hours_today := EXTRACT(EPOCH FROM (v_end_of_day - v_start_of_day)) / 3600;

                    -- Se o deadline couber totalmente dentro do expediente que sobrou hoje
                    IF v_remaining_hours <= v_hours_today THEN
                        v_deadline := v_start_of_day + (v_remaining_hours * interval '1 hour');
                        RETURN v_deadline;
                    ELSE
                        -- O deadline cai num dia futuro, deduz as horas gastas hoje e pula pro dia seguinte
                        v_remaining_hours := v_remaining_hours - v_hours_today;
                    END IF;
                END IF;
            END IF;
        END IF;

        -- Zera para o próximo ciclo: o ponto de start de horas passa a ser a "abertura" global do dia seguinte
        v_current_day := v_current_day + interval '1 day';
        p_start_time := v_current_day; 
    END LOOP;

    -- Proteção contra falha catastrófica: se a tabela de business hours não existirem,
    -- retorna a data linear sem cálculo de negócios ao bater em 100 dias corridos para o cron job não falhar.
    RETURN p_start_time + (p_sla_hours * interval '1 hour');
END;
$$ LANGUAGE plpgsql STABLE;
