import { useEffect, useState } from 'react';
import { isMockMode, supabase } from '../lib/supabase';
import { fetchRoleNotificationPreferences, type NotificationPreferences } from '../lib/notificationPreferences';
import type { UserRole } from '../types';

export function useNotificationPreferences(role?: UserRole): NotificationPreferences {
  const [preferences, setPreferences] = useState<NotificationPreferences>({});

  useEffect(() => {
    if (!role) {
      setPreferences({});
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const next = await fetchRoleNotificationPreferences(role);
        if (active) setPreferences(next);
      } catch (error) {
        console.warn('[Notifications] Falha ao carregar preferências:', error);
      }
    };
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ role: UserRole }>).detail?.role === role) void refresh();
    };
    void refresh();
    window.addEventListener('qualitrack:notification-preferences-changed', onChanged);
    window.addEventListener('focus', refresh);
    const channel = !isMockMode && supabase
      ? supabase.channel(`notification-role-preferences-${role}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'notification_role_preferences', filter: `role=eq.${role}`,
        }, () => { void refresh(); })
        .subscribe()
      : null;
    return () => {
      active = false;
      window.removeEventListener('qualitrack:notification-preferences-changed', onChanged);
      window.removeEventListener('focus', refresh);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [role]);

  return preferences;
}
