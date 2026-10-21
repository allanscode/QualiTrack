BEGIN;

-- Close only contested monitorias whose corrected result and Auditor Record
-- can both be verified. An old, inconsistent record must never be published.
DO $$
DECLARE
  r record;
  v_last jsonb;
  v_contested_at timestamptz;
  v_questions integer;
  v_all_yes boolean;
  v_valid boolean;
  v_child boolean;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT m.*
    FROM public.monitorias m
    WHERE m.active IS TRUE
      AND m.status = 'aguardando_gestor_qualidade'
      AND m.contestation_result = 'pending'
      AND btrim(m.ticket_id) ~ '^[0-9]+$'
      AND jsonb_typeof(m.history) = 'array'
      AND jsonb_array_length(m.history) >= 2
      AND NOT EXISTS (
        SELECT 1 FROM public.monitorias newer
        WHERE newer.ticket_id = m.ticket_id AND newer.active IS TRUE
          AND newer.created_at > m.created_at
      )
    FOR UPDATE OF m
  LOOP
    v_last := r.history->(jsonb_array_length(r.history)-1);
    IF coalesce(v_last->>'action', '') NOT IN
      ('Edição pelo Administrador', 'Edição pela Gestão da Qualidade')
      OR coalesce(v_last->>'note', '') !~* '(Critério|Score:|Erro crítico|nota)'
      OR coalesce(v_last->>'by_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR coalesce(v_last->>'at', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      OR NOT EXISTS (
        SELECT 1 FROM public.users actor
        WHERE actor.id = (v_last->>'by_id')::uuid
          AND actor.active IS TRUE
          AND actor.role IN ('admin', 'gestor_qualidade')
      ) THEN
      CONTINUE;
    END IF;

    SELECT max((event->>'at')::timestamptz) INTO v_contested_at
    FROM jsonb_array_elements(r.history) event
    WHERE event->>'action' ~* 'Contestação realizada pelo Gestor de Suporte'
      AND event->>'at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T';
    IF v_contested_at IS NULL OR (v_last->>'at')::timestamptz <= v_contested_at THEN
      CONTINUE;
    END IF;

    v_child := r.form_id IN (
      '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
    ) OR r.form_snapshot->>'ticket_kind' = 'chamado_filho';
    IF v_child THEN
      SELECT count(*)::integer,
        coalesce(bool_and(r.answers->>(question->>'id') = 'SIM'), false)
      INTO v_questions, v_all_yes
      FROM jsonb_array_elements(coalesce(r.form_snapshot->'sections', '[]'::jsonb)) section
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(section->'questions', '[]'::jsonb)) question;
      v_valid := v_questions > 0 AND v_all_yes;
    ELSE
      v_valid := r.score >= 75;
    END IF;
    IF NOT v_valid OR nullif(btrim(coalesce(r.evaluator_note, '')), '') IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.ai_evaluation_logs log
      WHERE log.ticket_id = r.ticket_id
        AND log.evaluation_type = 'registro_auditor'
        AND log.status = 'success'
        AND log.created_at >= v_contested_at
        AND log.created_at <= (v_last->>'at')::timestamptz + interval '5 minutes'
        AND btrim(log.response_json->>'auditor_record') = btrim(r.evaluator_note)
        AND (CASE WHEN v_child THEN
          log.prompt_text LIKE '%"answer": "SIM"%' OR log.prompt_text LIKE '%Resposta: SIM%'
          ELSE log.prompt_text LIKE ('%"score": ' || r.score::text || '%') END)
    ) THEN
      CONTINUE;
    END IF;

    PERFORM set_config('app.quality_final_backfill', r.id::text, true);
    UPDATE public.monitorias
    SET status = 'concluida',
        contestation_result = 'approved',
        resolution_type = 'human',
        action_deadline_at = NULL,
        history = history || jsonb_build_array(jsonb_build_object(
          'action', 'Monitoria concluída após revisão da Gestão da Qualidade',
          'by_id', NULL,
          'by_name', 'Sistema',
          'at', now(),
          'note', 'Ficha válida e Registro do Auditor atualizado confirmados. A revisão técnica anterior permanece no histórico.'
        )),
        updated_at = now()
    WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Contestações corrigidas e concluídas com registro validado: %', v_count;
END;
$$;

-- A previously concluded monitoria can become valid after an administrative
-- edit. Restore the missing final milestone without changing publication state.
DO $$
DECLARE
  r record;
  v_last jsonb;
  v_questions integer;
  v_all_yes boolean;
  v_valid boolean;
  v_previous_score text;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT m.* FROM public.monitorias m
    WHERE m.active IS TRUE AND m.status = 'concluida'
      AND jsonb_typeof(m.history) = 'array'
      AND jsonb_array_length(m.history) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.monitorias newer
        WHERE newer.ticket_id = m.ticket_id AND newer.active IS TRUE
          AND newer.created_at > m.created_at
      )
    FOR UPDATE OF m
  LOOP
    v_last := r.history->(jsonb_array_length(r.history)-1);
    IF coalesce(v_last->>'action', '') NOT IN
      ('Edição pelo Administrador', 'Edição pela Gestão da Qualidade')
      OR coalesce(v_last->>'note', '') !~* '(Critério|Score:|Erro crítico|nota)'
      OR coalesce(v_last->>'by_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR NOT EXISTS (
        SELECT 1 FROM public.users actor WHERE actor.id = (v_last->>'by_id')::uuid
          AND actor.role IN ('admin', 'gestor_qualidade')
      ) THEN
      CONTINUE;
    END IF;

    IF r.form_id IN (
      '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
    ) OR r.form_snapshot->>'ticket_kind' = 'chamado_filho' THEN
      SELECT count(*)::integer,
        coalesce(bool_and(r.answers->>(question->>'id') = 'SIM'), false)
      INTO v_questions, v_all_yes
      FROM jsonb_array_elements(coalesce(r.form_snapshot->'sections', '[]'::jsonb)) section
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(section->'questions', '[]'::jsonb)) question;
      v_valid := v_questions > 0 AND v_all_yes;
      IF coalesce(v_last->>'note', '') !~* '(NA|NAO|NÃO)[^|]*→ SIM' THEN
        CONTINUE;
      END IF;
    ELSE
      v_valid := r.score >= 75;
      v_previous_score := (regexp_match(coalesce(v_last->>'note', ''), 'Score: ([0-9]+([.,][0-9]+)?)%'))[1];
      IF v_previous_score IS NULL OR replace(v_previous_score, ',', '.')::numeric >= 75 THEN
        CONTINUE;
      END IF;
    END IF;
    IF NOT v_valid THEN CONTINUE; END IF;

    UPDATE public.monitorias
    SET history = history || jsonb_build_array(jsonb_build_object(
      'action', 'Monitoria concluída com veredito válido após revisão',
      'by_id', NULL,
      'by_name', 'Sistema',
      'at', now(),
      'note', 'Marco de conclusão restaurado após a revisão registrada no evento anterior.'
    ))
    WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Marcos de conclusão restaurados em monitorias já concluídas: %', v_count;
END;
$$;

COMMIT;
