import { useCallback, useEffect, useRef, useState } from 'react';
import { Monitoria, User } from '../types';
import { isMockMode, mockDb, supabase } from '../lib/supabase';

// Only fields used by App's notification menu are fetched on sign-in.
const BASE_COLUMNS = 'id,form_id,child_verdict,ticket_id,status,evaluator_id,evaluated_id,score,created_at,updated_at,action_deadline_at,active';

export function useMonitoriaNotifications(user: User | null) {
  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const currentUserId = useRef(user?.id);
  currentUserId.current = user?.id;

  const load = useCallback(async () => {
    if (!user) {
      setMonitorias([]);
      return;
    }
    try {
      if (isMockMode || !supabase) {
        const { data } = await mockDb.get('monitorias');
        if (currentUserId.current !== user.id) return;
        setMonitorias((data || []).filter((row: Monitoria) => row.active !== false &&
          (user.role !== 'suporte' || row.evaluated_id === user.id) &&
          (user.role !== 'gestor_suporte' || Boolean(row.team_id && user.team_ids?.includes(row.team_id)))));
        setOwnerId(user.id);
        return;
      }

      const source = user.role === 'suporte' ? 'vw_monitorias_suporte' : 'monitorias';
      const now = new Date();
      const fourHours = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      const requests = [];

      if (['admin', 'gestor_qualidade', 'qualidade'].includes(user.role)) {
        let contestations = supabase.from(source)
          .select(`${BASE_COLUMNS},history`)
          .eq('active', true)
          .eq('status', 'em_contestacao')
          .order('updated_at', { ascending: false })
          .limit(50);
        if (user.role === 'qualidade') contestations = contestations.eq('evaluator_id', user.id);
        requests.push(contestations);
      }

      if (user.role === 'suporte') {
        requests.push(supabase.from(source)
          .select(BASE_COLUMNS)
          .eq('active', true)
          .eq('evaluated_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1));
      }

      let deadlines = supabase.from(source)
        .select(BASE_COLUMNS)
        .eq('active', true)
        .gt('action_deadline_at', now.toISOString())
        .lte('action_deadline_at', fourHours.toISOString())
        .neq('status', 'concluida')
        .order('action_deadline_at', { ascending: true })
        .limit(3);
      if (user.role === 'suporte') deadlines = deadlines.eq('evaluated_id', user.id);
      if (user.role === 'gestor_suporte') {
        if (user.team_ids?.length) deadlines = deadlines.in('team_id', user.team_ids);
        else deadlines = deadlines.eq('team_id', '00000000-0000-0000-0000-000000000000');
      }
      requests.push(deadlines);

      const results = await Promise.all(requests);
      const error = results.find(result => result.error)?.error;
      if (error) throw error;
      const rows = results.flatMap(result => result.data || []) as unknown as Monitoria[];
      if (currentUserId.current === user.id) {
        setMonitorias([...new Map(rows.map(row => [row.id, row])).values()]);
        setOwnerId(user.id);
      }
    } catch (error) {
      console.error('[Monitoria notifications] Falha ao carregar avisos:', error);
    }
  }, [user]);

  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('qualitrack:reconnected', refresh);
    return () => window.removeEventListener('qualitrack:reconnected', refresh);
  }, [load]);

  useEffect(() => {
    if (!user || isMockMode || !supabase) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const client = supabase;
    const channel = client.channel(`monitoria-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitorias' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => { void load(); }, 300);
      }).subscribe();
    return () => {
      clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [load, user?.id]);

  return ownerId === user?.id ? monitorias : [];
}
