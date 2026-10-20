CREATE TABLE IF NOT EXISTS public.notification_role_preferences (
  role text NOT NULL CHECK (role IN ('admin', 'gestor_suporte', 'gestor_qualidade', 'qualidade', 'suporte')),
  kind text NOT NULL CHECK (kind IN (
    'contestation', 'new_monitoria', 'feedback_pending', 'feedback_ack',
    'deadline', 'queue_negative', 'queue_child_review',
    'manual_pending', 'manual_updated', 'manual_rejected'
  )),
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id),
  PRIMARY KEY (role, kind)
);

ALTER TABLE public.notification_role_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_role_preferences TO authenticated;
REVOKE ALL ON public.notification_role_preferences FROM anon;

DROP POLICY IF EXISTS notification_role_preferences_read ON public.notification_role_preferences;
CREATE POLICY notification_role_preferences_read ON public.notification_role_preferences
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS notification_role_preferences_admin_insert ON public.notification_role_preferences;
CREATE POLICY notification_role_preferences_admin_insert ON public.notification_role_preferences
  FOR INSERT TO authenticated WITH CHECK (_private.is_admin_user());

DROP POLICY IF EXISTS notification_role_preferences_admin_update ON public.notification_role_preferences;
CREATE POLICY notification_role_preferences_admin_update ON public.notification_role_preferences
  FOR UPDATE TO authenticated USING (_private.is_admin_user())
  WITH CHECK (_private.is_admin_user());

DROP POLICY IF EXISTS notification_role_preferences_admin_delete ON public.notification_role_preferences;
CREATE POLICY notification_role_preferences_admin_delete ON public.notification_role_preferences
  FOR DELETE TO authenticated USING (_private.is_admin_user());

-- Consolidate old per-user choices by role. A majority wins; ties keep the
-- default enabled behavior. The old table remains intact for rollback/history.
INSERT INTO public.notification_role_preferences (role, kind, enabled)
SELECT u.role,
       p.kind,
       count(*) FILTER (WHERE p.enabled) >= count(*) FILTER (WHERE NOT p.enabled)
FROM public.notification_preferences p
JOIN public.users u ON u.id = p.user_id
GROUP BY u.role, p.kind
ON CONFLICT (role, kind) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'notification_role_preferences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_role_preferences;
  END IF;
END;
$$;
