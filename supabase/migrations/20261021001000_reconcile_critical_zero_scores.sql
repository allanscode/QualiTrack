BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT set_config('request.jwt.claim.role', 'service_role', true);

LOCK TABLE public.monitorias IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE remaining_critical_score_candidates ON COMMIT DROP AS
WITH eligible AS (
  SELECT m.id, m.ticket_id, m.status, m.score, m.form_snapshot, m.answers,
         m.history, m.updated_at,
         CASE WHEN m.form_snapshot->>'automation' = 'positive_csat'
           THEN 'positive_csat_initial_review' ELSE 'automatic_deadline_completion' END AS source
  FROM public.monitorias m
  WHERE m.active IS TRUE
    AND m.score = 0
    AND coalesce(cardinality(m.selected_critical_errors), 0) > 0
    AND m.form_id NOT IN (
      '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8970'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8971'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8972'::uuid,
      '6c7d1e88-841b-4da9-9a66-9f1464ce8973'::uuid
    )
    AND coalesce(m.form_snapshot->>'ticket_kind', '') <> 'chamado_filho'
    AND (
      (m.status = 'pendente_revisao'
        AND m.form_snapshot->>'automation' = 'positive_csat'
        AND jsonb_typeof(m.history) = 'array'
        AND jsonb_array_length(m.history) = 1)
      OR
      (m.status = 'concluida'
        AND m.resolution_type = 'automatic'
        AND coalesce(m.form_snapshot->>'automation', '') <> 'positive_csat'
        AND jsonb_typeof(m.history) = 'array'
        AND jsonb_array_length(m.history) = 2
        AND m.history->0->>'action' = 'Monitoria Criada'
        AND coalesce(m.history->1->>'by_name', '') ILIKE 'Sistema Autom%'
        AND position('Prazo' in coalesce(m.history->1->>'action', '')) > 0)
    )
), per_section AS (
  SELECT e.id,
         coalesce((section.value->>'weight')::numeric, 0) AS section_weight,
         count(*) FILTER (WHERE e.answers->>(question.value->>'id') IS DISTINCT FROM 'NA') AS active_questions,
         count(*) FILTER (WHERE e.answers->>(question.value->>'id') = 'SIM') AS yes_answers
  FROM eligible e
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(e.form_snapshot->'sections') = 'array'
      THEN e.form_snapshot->'sections' ELSE '[]'::jsonb END
  ) section(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(section.value->'questions') = 'array'
      THEN section.value->'questions' ELSE '[]'::jsonb END
  ) question(value)
  GROUP BY e.id, section.value
), normal_scores AS (
  SELECT id,
    CASE WHEN coalesce(sum(section_weight) FILTER (WHERE active_questions > 0), 0) = 0 THEN 100::numeric
      ELSE round(
        100 * sum(section_weight * yes_answers / nullif(active_questions, 0)) FILTER (WHERE active_questions > 0)
          / nullif(sum(section_weight) FILTER (WHERE active_questions > 0), 0),
        2
      )
    END AS recalculated_score
  FROM per_section
  GROUP BY id
)
SELECT e.id, e.ticket_id, e.status, e.score AS previous_score,
       s.recalculated_score, e.history AS previous_history,
       e.updated_at AS previous_updated_at, e.source
FROM eligible e
JOIN normal_scores s USING (id);

DO $$
DECLARE item record; updated_count integer := 0; candidate_count integer;
BEGIN
  SELECT count(*) INTO candidate_count FROM remaining_critical_score_candidates;
  FOR item IN SELECT * FROM remaining_critical_score_candidates ORDER BY ticket_id, id LOOP
    IF item.recalculated_score IS NULL OR item.recalculated_score < 0 OR item.recalculated_score > 100 THEN
      RAISE EXCEPTION 'Invalid normal score for monitoria %; reconciliation aborted.', item.id;
    END IF;

    INSERT INTO qwp_private_audit.critical_score_reconciliation (
      monitoria_id, ticket_id, source, previous_score, recalculated_score,
      previous_history_length, previous_updated_at
    ) VALUES (
      item.id, item.ticket_id, item.source, item.previous_score, item.recalculated_score,
      jsonb_array_length(coalesce(item.previous_history, '[]'::jsonb)), item.previous_updated_at
    );

    UPDATE public.monitorias
    SET score = item.recalculated_score,
        history = coalesce(item.previous_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'action', 'Pontuação recalculada sem penalidade automática por erro crítico',
          'by_id', NULL, 'by_name', 'Sistema', 'at', now(),
          'note', format('Nota anterior: %s%%. Nota recalculada pelos pesos e respostas da ficha: %s%%. Respostas, evidências e decisões humanas foram preservadas.', item.previous_score, item.recalculated_score)
        )),
        updated_at = now()
    WHERE id = item.id AND active IS TRUE AND score = item.previous_score
      AND status = item.status;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Monitoria % changed during score reconciliation; transaction aborted.', item.id;
    END IF;
    updated_count := updated_count + 1;
  END LOOP;

  IF updated_count <> candidate_count THEN
    RAISE EXCEPTION 'Expected % score updates but applied %; transaction aborted.', candidate_count, updated_count;
  END IF;
END $$;

COMMIT;
