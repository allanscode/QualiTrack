import { useEffect, useState } from 'react';
import { isMockMode, supabase } from '../lib/supabase';
import { fetchNotificationPreferences, type NotificationPreferences } from '../lib/notificationPreferences';

export function useNotificationPreferences(userId?: string): NotificationPreferences {
  const [preferences, setPreferences] = useState<NotificationPreferences>({});

  useEffect(() => {
    if (!userId) {
      setPreferences({});
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const next = await fetchNotificationPreferences(userId);
        if (active) setPreferences(next);
      } catch (error) {
        console.warn('[Notifications] Falha ao carregar preferências:', error);
      }
    };
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ userId: string }>).detail?.userId === userId) void refresh();
    };
    void refresh();
    window.addEventListener('qualitrack:notification-preferences-changed', onChanged);
    window.addEventListener('focus', refresh);
    const channel = !isMockMode && supabase
      ? supabase.channel(`notification-preferences-${userId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'notification_preferences', filter: `user_id=eq.${userId}`,
        }, () => { void refresh(); })
        .subscribe()
      : null;
    return () => {
      active = false;
      window.removeEventListener('qualitrack:notification-preferences-changed', onChanged);
      window.removeEventListener('focus', refresh);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [userId]);

  return preferences;
}
