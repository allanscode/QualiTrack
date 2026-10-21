BEGIN;

-- Keep the UUID primary key untouched: submissions, publications, AI jobs and
-- other records reference it. This numeric ID is only for display and search.
LOCK TABLE public.monitorias IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.monitorias
  ADD COLUMN IF NOT EXISTS display_id bigint;

CREATE SEQUENCE IF NOT EXISTS public.monitorias_display_id_seq;

DO $migration$
DECLARE
  v_identity "char";
  v_default text;
BEGIN
  SELECT a.attidentity, pg_get_expr(d.adbin, d.adrelid)
    INTO v_identity, v_default
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.monitorias'::regclass
    AND a.attname = 'display_id'
    AND NOT a.attisdropped;

  IF coalesce(v_identity, '') = '' AND v_default IS NULL THEN
    ALTER TABLE public.monitorias
      ALTER COLUMN display_id SET DEFAULT nextval('public.monitorias_display_id_seq');
    ALTER SEQUENCE public.monitorias_display_id_seq
      OWNED BY public.monitorias.display_id;
  END IF;
END;
$migration$;

-- Renumber every existing row once by creation time, with UUID as a stable
-- tie-breaker. Future inserts continue after the last assigned number.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC NULLS FIRST, id ASC) AS new_display_id
  FROM public.monitorias
)
UPDATE public.monitorias AS m
SET display_id = ordered.new_display_id
FROM ordered
WHERE m.id = ordered.id;

ALTER TABLE public.monitorias
  ALTER COLUMN display_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS monitorias_display_id_uidx
  ON public.monitorias(display_id);

DO $migration$
DECLARE
  v_sequence text := pg_get_serial_sequence('public.monitorias', 'display_id');
  v_max bigint;
BEGIN
  SELECT max(display_id) INTO v_max FROM public.monitorias;
  IF v_sequence IS NULL THEN
    RAISE EXCEPTION 'Could not resolve the sequence for monitorias.display_id';
  END IF;
  IF v_max IS NULL THEN
    PERFORM setval(v_sequence::regclass, 1, false);
  ELSE
    PERFORM setval(v_sequence::regclass, v_max, true);
  END IF;
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, service_role', v_sequence::regclass);
END;
$migration$;

COMMENT ON COLUMN public.monitorias.display_id IS
  'Sequential human-facing monitoria protocol; internal relationships continue using UUID id.';

-- Support users read through an anonymized view. Preserve its deployed query
-- and append the display number, so evaluator identity and view predicates stay
-- exactly as they are today.
DO $migration$
DECLARE
  v_definition text := pg_get_viewdef('public.vw_monitorias_suporte'::regclass, true);
  v_extended text;
BEGIN
  v_extended := regexp_replace(
    v_definition,
    chr(10) || '[[:space:]]+FROM (public[.])?monitorias[[:space:]]+(AS[[:space:]]+)?m' || chr(10),
    ',' || chr(10) || ' m.display_id' || chr(10) || 'FROM monitorias m' || chr(10)
  );
  IF v_extended = v_definition THEN
    RAISE EXCEPTION 'Could not safely append display_id to vw_monitorias_suporte';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_monitorias_suporte '
    || 'WITH (security_invoker = false, security_barrier = true) AS ' || v_extended;
END;
$migration$;

COMMIT;
