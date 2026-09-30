-- Keep feedback notifications current while the recipient is online.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_feedbacks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_feedbacks;
  END IF;
END;
$$;
