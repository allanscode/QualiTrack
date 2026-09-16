-- Fail CLOSED on a project that already has application data/architecture.
-- Run as the project database owner, not through the browser or an Edge Function.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
        AND d.objid = c.oid AND d.deptype = 'e')
  ) OR EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'Clean install refused: project already contains public relations or Auth users. Do not reset the existing project.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'Supabase Realtime publication is missing; use a provisioned Supabase project.';
  END IF;
END $$;
