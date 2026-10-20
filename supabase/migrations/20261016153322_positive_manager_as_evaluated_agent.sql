BEGIN;

-- A support manager can also handle a Zendesk ticket. Keep the existing
-- evaluation and decision flow; only admit that role as the evaluated agent.
DO $$
DECLARE
  function_name text;
  function_signature text;
  definition text;
  match_count integer;
BEGIN
  FOR function_name, function_signature IN
    SELECT * FROM (VALUES
      ('start_positive_ai_job', 'public.start_positive_ai_job(text,uuid,jsonb,jsonb)'),
      ('finish_positive_ai_job', 'public.finish_positive_ai_job(uuid)')
    ) AS functions(name, signature)
  LOOP
    SELECT pg_get_functiondef(to_regprocedure(function_signature)) INTO definition;
    IF definition IS NULL THEN
      RAISE EXCEPTION 'Missing positive AI function: %', function_signature;
    END IF;
    match_count := (length(definition) - length(replace(definition, 'role=''suporte''', '')))
      / length('role=''suporte''');
    IF match_count <> 1 THEN
      RAISE EXCEPTION 'Expected one support-only role check in %, found %', function_name, match_count;
    END IF;
    EXECUTE replace(definition, 'role=''suporte''', 'role IN (''suporte'',''gestor_suporte'')');
  END LOOP;
END $$;

COMMIT;
