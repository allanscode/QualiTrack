import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { userCacheScope } from '../lib/pageCache';
import type { Monitoria, User } from '../types';

export interface MonitoriaTicketContext {
  monitoria_id: string;
  ticket_subject: string | null;
  ticket_group_name: string | null;
}

export function useMonitoriaTicketContext(monitorias: Monitoria[], user: User | null) {
  const ids = [...new Set(monitorias.map(row => row.id))].sort();
  return useQuery({
    queryKey: ['monitoriaTicketContext', userCacheScope(user), ids],
    enabled: Boolean(supabase && user && ids.length),
    staleTime: 3 * 60_000,
    queryFn: async ({ signal }) => {
      const rows: MonitoriaTicketContext[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await supabase!.rpc('get_monitoria_ticket_context', {
          p_monitoria_ids: ids.slice(offset, offset + 100),
        }).abortSignal(signal);
        if (error) throw error;
        rows.push(...(data as MonitoriaTicketContext[] || []));
      }
      return Object.fromEntries(rows.map(row => [row.monitoria_id, row]));
    },
  });
}
