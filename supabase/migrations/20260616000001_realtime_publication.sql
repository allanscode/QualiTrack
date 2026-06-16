-- =================================================================
-- Enable Supabase Realtime for critical tables (idempotent)
-- =================================================================
-- Uses pg_publication_tables to check before adding, so it's safe
-- to run multiple times without warnings/errors.
-- =================================================================

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'public.monitorias',
    'public.quality_configs',
    'public.user_preferences',
    'public.teams',
    'public.user_teams',
    'public.forms'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = split_part(tbl, '.', 1)
        AND tablename = split_part(tbl, '.', 2)
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', tbl);
    END IF;
  END LOOP;
END $$;
