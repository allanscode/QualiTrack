-- Show child tickets to quality only when the AI requests human review.
ALTER TABLE public.queue_event_notifications
  DROP CONSTRAINT IF EXISTS queue_event_notifications_event_type_check;
ALTER TABLE public.queue_event_notifications
  ADD CONSTRAINT queue_event_notifications_event_type_check
  CHECK (event_type IN ('csat_bad', 'child_ticket_created', 'child_ticket_review_required'));

CREATE OR REPLACE FUNCTION public.notify_child_ticket_review_required()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status <> 'review_required' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'review_required' THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO public.queue_event_notifications (event_key, event_type, ticket_id, occurred_at)
  VALUES (
    'child_ticket_review_required:' || NEW.ticket_id || ':' || NEW.updated_at::text,
    'child_ticket_review_required', NEW.ticket_id, NEW.updated_at
  )
  ON CONFLICT (event_key) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_child_ticket_review_required() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_child_ticket_review_required ON public.child_ai_queue;
CREATE TRIGGER notify_child_ticket_review_required
  AFTER INSERT OR UPDATE OF status ON public.child_ai_queue
  FOR EACH ROW EXECUTE FUNCTION public.notify_child_ticket_review_required();

INSERT INTO public.queue_event_notifications (event_key, event_type, ticket_id, occurred_at)
SELECT 'child_ticket_review_required:' || q.ticket_id || ':' || q.updated_at::text,
  'child_ticket_review_required', q.ticket_id, q.updated_at
FROM public.child_ai_queue q
WHERE q.status = 'review_required'
ON CONFLICT (event_key) DO NOTHING;

-- An administrator can choose which notification types each user sees.
-- Missing rows mean the default (enabled). This controls display only.
CREATE TABLE public.notification_preferences (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'contestation', 'new_monitoria', 'feedback_pending', 'feedback_ack',
    'deadline', 'queue_negative', 'queue_child_review',
    'manual_pending', 'manual_updated', 'manual_rejected'
  )),
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_preferences_read ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR _private.is_admin_user());
CREATE POLICY notification_preferences_admin_insert ON public.notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (_private.is_admin_user());
CREATE POLICY notification_preferences_admin_update ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING (_private.is_admin_user())
  WITH CHECK (_private.is_admin_user());
CREATE POLICY notification_preferences_admin_delete ON public.notification_preferences
  FOR DELETE TO authenticated
  USING (_private.is_admin_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
REVOKE ALL ON public.notification_preferences FROM anon;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'notification_preferences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_preferences;
  END IF;
END;
$$;
