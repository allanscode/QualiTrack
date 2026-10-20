-- Executed only on develop project secfejmccojxsvdntljx via Supabase Management API.
-- Production project vpytvgpsqdapgouyjowc was queried read-only beforehand:
-- critical_errors was [] for all three active forms.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.forms IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
DECLARE state_ok boolean;
BEGIN
  SELECT count(*) = 3 AND bool_and(
    CASE id
      WHEN '6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
        THEN md5(to_jsonb(f)::text) = '0e7d55fb1a8c803bd4962f0e484748df'
      WHEN '8f84cfd0-8a3c-4735-8921-2eef159f094c'::uuid
        THEN md5(to_jsonb(f)::text) = 'd1038bc33b3e43f88c1a0c1dfd71a03f'
      WHEN 'f1fc47e9-6d51-40a5-938e-8108e225195e'::uuid
        THEN md5(to_jsonb(f)::text) = 'd71831c45196899635d9f4bca5e356a5'
      ELSE false
    END
  ) INTO state_ok
  FROM public.forms f
  WHERE id IN (
    '6c7d1e88-841b-4da9-9a66-9f1464ce896f',
    '8f84cfd0-8a3c-4735-8921-2eef159f094c',
    'f1fc47e9-6d51-40a5-938e-8108e225195e'
  );
  IF state_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Form state changed since read-only preflight; no update applied';
  END IF;
END $guard$;

CREATE SCHEMA qwp_test_backup_20261019_forms_critical_errors;
REVOKE ALL ON SCHEMA qwp_test_backup_20261019_forms_critical_errors
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE qwp_test_backup_20261019_forms_critical_errors.forms_original AS
SELECT * FROM public.forms WHERE id IN (
  '8f84cfd0-8a3c-4735-8921-2eef159f094c',
  'f1fc47e9-6d51-40a5-938e-8108e225195e'
);
ALTER TABLE qwp_test_backup_20261019_forms_critical_errors.forms_original
  ADD PRIMARY KEY (id);
REVOKE ALL ON TABLE qwp_test_backup_20261019_forms_critical_errors.forms_original
  FROM PUBLIC, anon, authenticated, service_role;

DO $change$
DECLARE changed_count integer;
BEGIN
  IF (SELECT count(*) FROM qwp_test_backup_20261019_forms_critical_errors.forms_original) <> 2 THEN
    RAISE EXCEPTION 'Backup does not contain exactly two forms';
  END IF;

  UPDATE public.forms SET critical_errors = '[]'::jsonb
  WHERE id IN (
    '8f84cfd0-8a3c-4735-8921-2eef159f094c',
    'f1fc47e9-6d51-40a5-938e-8108e225195e'
  );
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 2 THEN
    RAISE EXCEPTION 'Expected to update exactly two forms, got %', changed_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.forms f
    JOIN qwp_test_backup_20261019_forms_critical_errors.forms_original b USING (id)
    WHERE f.critical_errors IS DISTINCT FROM '[]'::jsonb
       OR (to_jsonb(f) - 'critical_errors') IS DISTINCT FROM (to_jsonb(b) - 'critical_errors')
  ) THEN
    RAISE EXCEPTION 'Updated forms differ outside critical_errors or critical_errors is not empty';
  END IF;

  IF (SELECT md5(to_jsonb(f)::text)
      FROM public.forms f
      WHERE id = '6c7d1e88-841b-4da9-9a66-9f1464ce896f')
     IS DISTINCT FROM '0e7d55fb1a8c803bd4962f0e484748df' THEN
    RAISE EXCEPTION 'Child form changed';
  END IF;
END $change$;
COMMIT;
