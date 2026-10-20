-- Executed only on develop project secfejmccojxsvdntljx.
-- Production remains read-only; it still has the three is_critical=true flags.
-- The form contains six questions. Only three currently have is_critical=true.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.forms IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
DECLARE
  flags_total integer;
  flags_true integer;
  questions_total integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.forms f
    WHERE id = '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
      AND active
      AND md5(to_jsonb(f)::text) = '0e7d55fb1a8c803bd4962f0e484748df'
      AND critical_errors = '[]'::jsonb
  ) THEN
    RAISE EXCEPTION 'Child form changed since read-only preflight';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE q.value ? 'is_critical'),
         count(*) FILTER (WHERE q.value->>'is_critical' = 'true')
  INTO questions_total, flags_total, flags_true
  FROM public.forms f,
       jsonb_array_elements(f.sections) AS s(value),
       jsonb_array_elements(s.value->'questions') AS q(value)
  WHERE f.id = '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid;
  IF questions_total <> 6 OR flags_total <> 3 OR flags_true <> 3 THEN
    RAISE EXCEPTION 'Unexpected child question/critical flag counts: %, %, %',
      questions_total, flags_total, flags_true;
  END IF;
END $guard$;

CREATE TABLE qwp_test_backup_20261019_forms_critical_errors.child_original AS
SELECT * FROM public.forms
WHERE id = '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid;
ALTER TABLE qwp_test_backup_20261019_forms_critical_errors.child_original
  ADD PRIMARY KEY (id);
REVOKE ALL ON TABLE qwp_test_backup_20261019_forms_critical_errors.child_original
  FROM PUBLIC, anon, authenticated, service_role;

DO $change$
DECLARE changed_count integer;
BEGIN
  IF (SELECT count(*) FROM qwp_test_backup_20261019_forms_critical_errors.child_original) <> 1 THEN
    RAISE EXCEPTION 'Child backup does not contain exactly one form';
  END IF;

  UPDATE public.forms
  SET sections = sections
    #- '{0,questions,0,is_critical}'
    #- '{1,questions,0,is_critical}'
    #- '{2,questions,1,is_critical}'
  WHERE id = '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 1 THEN
    RAISE EXCEPTION 'Expected to update exactly one child form, got %', changed_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.forms f
    JOIN qwp_test_backup_20261019_forms_critical_errors.child_original b USING (id)
    WHERE (to_jsonb(f) - 'sections') IS DISTINCT FROM (to_jsonb(b) - 'sections')
       OR f.sections IS DISTINCT FROM
         (b.sections
           #- '{0,questions,0,is_critical}'
           #- '{1,questions,0,is_critical}'
           #- '{2,questions,1,is_critical}')
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(f.sections) AS s(value),
                       jsonb_array_elements(s.value->'questions') AS q(value)
         WHERE q.value ? 'is_critical'
       )
  ) THEN
    RAISE EXCEPTION 'Child form differs outside the three is_critical removals';
  END IF;
END $change$;
COMMIT;
