import { useCallback, useEffect, useRef, useState } from 'react';
import { Monitoria, User } from '../types';
import { isMockMode, mockDb, supabase } from '../lib/supabase';

// The queue needs every active ticket identifier to avoid offering an already
// audited ticket. Keep this query separate from the paginated monitoria screen.
const INDEX_COLUMNS = 'id,ticket_id,active,status,created_at,updated_at,evaluated_id,evaluator_id,resolution_type,score,satisfaction_result,team_id';
const CHUNK_SIZE = 1000;

export function useMonitoriaIndex(user: User | null, enabled: boolean) {
  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const currentUserId = useRef(user?.id);
  currentUserId.current = user?.id;

  const load = useCallback(async () => {
    if (!user || !enabled) return;
    setLoading(true);
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
      const result: Monitoria[] = [];
      for (let offset = 0; ; offset += CHUNK_SIZE) {
        let query = supabase.from(source).select(INDEX_COLUMNS)
          .eq('active', true)
          .order('created_at', { ascending: false })
          .range(offset, offset + CHUNK_SIZE - 1);
        if (user.role === 'suporte') {
          query = query.eq('evaluated_id', user.id);
        } else if (user.role === 'gestor_suporte') {
          if (!user.team_ids?.length) break;
          query = query.in('team_id', user.team_ids);
        }
        const { data, error } = await query;
        if (error) throw error;
        const page = (data || []) as unknown as Monitoria[];
        result.push(...page);
        if (page.length < CHUNK_SIZE) break;
      }
      if (currentUserId.current === user.id) {
        setMonitorias(result);
        setOwnerId(user.id);
      }
    } catch (error) {
      console.error('[Monitoria index] Falha ao carregar tickets auditados:', error);
    } finally {
      setLoading(false);
    }
  }, [enabled, user]);

  useEffect(() => {
    if (!enabled) {
      setMonitorias([]);
      return;
    }
    void load();
  }, [enabled, load]);

  return { monitorias: ownerId === user?.id ? monitorias : [], loading, reload: load };
}
