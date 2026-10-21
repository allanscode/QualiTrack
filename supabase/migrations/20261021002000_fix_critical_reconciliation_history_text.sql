BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
DECLARE updated_count integer; expected_count integer;
BEGIN
  SELECT count(*) INTO expected_count
  FROM qwp_private_audit.critical_score_reconciliation;

  IF expected_count > 0 THEN
    UPDATE public.monitorias m
    SET history = jsonb_set(
      jsonb_set(m.history,
        ARRAY[(jsonb_array_length(m.history) - 1)::text, 'action'],
        to_jsonb('Pontuacao recalculada sem penalidade automatica por erro critico'::text)),
        ARRAY[(jsonb_array_length(m.history) - 1)::text, 'note'],
        to_jsonb(format('Nota anterior: %s%%. Nota recalculada pelos pesos e respostas da ficha: %s%%. Respostas, evidencias e decisoes humanas foram preservadas.', a.previous_score, a.recalculated_score))
      ),
      updated_at = now()
    FROM qwp_private_audit.critical_score_reconciliation a
    WHERE a.monitoria_id = m.id
      AND jsonb_typeof(m.history) = 'array'
      AND jsonb_array_length(m.history) > 0;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count <> expected_count THEN
      RAISE EXCEPTION 'Expected to repair % history entries, repaired %; transaction aborted.', expected_count, updated_count;
    END IF;
  END IF;
END $$;

COMMIT;
