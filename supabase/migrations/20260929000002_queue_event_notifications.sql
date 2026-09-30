-- Zendesk webhook events become durable notifications instead of login-time placeholders.
CREATE TABLE IF NOT EXISTS public.queue_event_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('csat_bad', 'child_ticket_created')),
  ticket_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS queue_event_notifications_occurred_at_idx
  ON public.queue_event_notifications (occurred_at DESC);

ALTER TABLE public.queue_event_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS queue_event_notifications_read ON public.queue_event_notifications;
CREATE POLICY queue_event_notifications_read ON public.queue_event_notifications
  FOR SELECT TO authenticated
  USING (
    _private.is_admin_user()
    OR (
      _private.is_quality_team_user()
      AND EXISTS (
        SELECT 1 FROM public.queue_ticket_assignments assignment
        WHERE assignment.ticket_id = queue_event_notifications.ticket_id
          AND assignment.queue_type = CASE queue_event_notifications.event_type
            WHEN 'csat_bad' THEN 'negativas' ELSE 'filhos' END
          AND assignment.assigned_to = (SELECT auth.uid())
      )
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.queue_event_notifications FROM anon, authenticated;
GRANT SELECT ON public.queue_event_notifications TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'queue_event_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_event_notifications;
  END IF;
END;
$$;
