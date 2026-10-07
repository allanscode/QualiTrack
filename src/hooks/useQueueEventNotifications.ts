import { useEffect, useState } from 'react';
import { isMockMode, supabase } from '../lib/supabase';
import type { User } from '../types';

export interface QueueEventNotification {
  id: string;
  event_type: 'csat_bad' | 'child_ticket_created';
  ticket_id: string;
  occurred_at: string;
}

export function useQueueEventNotifications(user: User | null): QueueEventNotification[] {
  const [events, setEvents] = useState<QueueEventNotification[]>([]);

  useEffect(() => {
    if (isMockMode || !supabase || !user?.active ||
        !['qualidade', 'gestor_qualidade', 'admin'].includes(user.role)) {
      setEvents([]);
      return;
    }

    const client = supabase;
    let mounted = true;
    const refresh = async () => {
      const { data, error } = await client.from('queue_event_notifications')
        .select('id,event_type,ticket_id,occurred_at')
        .order('occurred_at', { ascending: false })
        .limit(50);
      if (!mounted) return;
      if (error) {
        console.warn('[Notifications] Falha ao carregar eventos de fila:', error.message);
        return;
      }
      setEvents((data || []) as QueueEventNotification[]);
    };

    void refresh();
    const channel = client.channel(`queue-notifications-${user.id}-${Math.random().toString(36).slice(2, 11)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'queue_event_notifications' }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_ticket_assignments' }, () => {
        void refresh();
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') void refresh();
      });

    return () => {
      mounted = false;
      void client.removeChannel(channel);
    };
  }, [user?.id, user?.role, user?.active]);

  return events;
}
