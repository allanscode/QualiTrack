-- Preserves existing timeout rules; only the scheduler/service may execute.
CREATE FUNCTION public.process_action_deadline_timeouts() RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE item record; quality_turn boolean;
BEGIN
  FOR item IN SELECT id,status,score FROM public.monitorias
    WHERE active AND action_deadline_at < now()
      AND status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada','pendente_revisao','aguardando_gestor_suporte','contestacao_negada')
    FOR UPDATE SKIP LOCKED
  LOOP
    quality_turn := item.status IN ('em_contestacao','aguardando_gestor_qualidade','reavaliacao_solicitada');
    UPDATE public.monitorias SET status = 'concluida',
      score = CASE WHEN quality_turn THEN 100 ELSE item.score END,
      resolution_type = 'automatic', concluded_at = now(), updated_at = now(),
      history = coalesce(history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action','Finalização Automática (Prazo)', 'by_id','system', 'by_name','Sistema Automático', 'at',now(),
        'note',CASE WHEN quality_turn THEN 'Monitoria aprovada automaticamente (nota 100%) por perda de prazo da Equipe de Qualidade.'
          ELSE 'Monitoria aprovada automaticamente por perda de prazo da Equipe de Suporte.' END))
    WHERE id = item.id;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.process_action_deadline_timeouts() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_action_deadline_timeouts() TO service_role;

-- Calendar is configured explicitly by the team, not copied from the old DB.
CREATE FUNCTION public.calculate_action_deadline(p_start_time timestamptz,p_action_hours numeric)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  day_date date := (p_start_time AT TIME ZONE 'America/Sao_Paulo')::date;
  remaining numeric := p_action_hours;
  opens timestamptz; closes timestamptz; available numeric; hours record;
BEGIN
  IF p_start_time IS NULL OR p_action_hours IS NULL OR p_action_hours < 0 OR p_action_hours > 2400 THEN
    RAISE EXCEPTION 'Invalid deadline parameters';
  END IF;
  IF remaining = 0 THEN RETURN p_start_time; END IF;
  FOR i IN 1..366 LOOP
    IF NOT EXISTS (SELECT 1 FROM public.holidays WHERE holiday_date = day_date) THEN
      SELECT * INTO hours FROM public.business_hours WHERE day_of_week = extract(dow FROM day_date) AND is_open;
      IF FOUND THEN
        opens := greatest((day_date + hours.open_time) AT TIME ZONE 'America/Sao_Paulo',p_start_time);
        closes := (day_date + hours.close_time) AT TIME ZONE 'America/Sao_Paulo';
        available := extract(epoch FROM closes - opens)/3600;
        IF available > 0 THEN
          IF remaining <= available THEN RETURN opens + remaining * interval '1 hour'; END IF;
          remaining := remaining - available;
        END IF;
      END IF;
    END IF;
    day_date := day_date + 1;
  END LOOP;
  RAISE EXCEPTION 'Business calendar missing or insufficient for deadline';
END $$;
REVOKE ALL ON FUNCTION public.calculate_action_deadline(timestamptz,numeric) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.calculate_action_deadline(timestamptz,numeric) TO authenticated,service_role;
