import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, mockDb, isMockMode } from '../lib/supabase';
import { Monitoria, User } from '../types';
import { toast } from 'sonner';

export function useMonitoriaData(user: User | null, activeTab?: string) {
  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [loading, setLoading] = useState(true);

  const hasLoadedOnce = useRef(false);
  const fetchingRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;

  const load = useCallback(async (silent = false) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    if (fetchingRef.current) {
      console.log('[Monitorias] Fetch já em andamento, ignorando...');
      return;
    }
    fetchingRef.current = true;
    if (!silent && !hasLoadedOnce.current) setLoading(true);
    try {
      let fetchedMonitorias: any[] = [];

      if (isMockMode) {
        const { data: d } = await mockDb.get('monitorias');
        fetchedMonitorias = d || [];
      } else {
        const executeWithRetry = async (retryCount = 0): Promise<any[]> => {
          try {
            console.log(`[Monitorias] Buscando monitorias (Tentativa ${retryCount + 1})...`);
            const controller = new AbortController();

            const isSuporte = currentUser.role === 'suporte';
            const source = isSuporte ? 'vw_monitorias_suporte' : 'monitorias';
            let monitoriasQuery = supabase!.from(source).select('*').order('created_at', { ascending: false });

            const myTeamIds = currentUser.team_ids || [];

            if (currentUser.role === 'suporte') {
              if (myTeamIds.length > 0) {
                monitoriasQuery = monitoriasQuery.or(`evaluated_id.eq.${currentUser.id},team_id.in.(${myTeamIds.map(id => `"${id}"`).join(',')})`);
              } else {
                monitoriasQuery = monitoriasQuery.eq('evaluated_id', currentUser.id);
              }
            } else if (currentUser.role === 'gestor_suporte') {
              if (myTeamIds.length > 0) {
                monitoriasQuery = monitoriasQuery.in('team_id', myTeamIds);
              } else {
                monitoriasQuery = monitoriasQuery.eq('team_id', '00000000-0000-0000-0000-000000000000');
              }
            }

            const fetchPromise = Promise.all([
              monitoriasQuery.abortSignal(controller.signal),
            ]);

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 15000)
            );

            const results = await Promise.race([fetchPromise, timeoutPromise]) as any[];
            const errorRes = results.find(r => r.error);
            if (errorRes) throw errorRes.error;

            return results;
          } catch (err: any) {
            console.error(`[Monitorias] Erro na tentativa ${retryCount + 1}:`, err);
            if (retryCount < 4) {
              const waitTime = Math.min(1000 * Math.pow(1.5, retryCount) + 1000 * retryCount, 10000);
              toast.loading(`Recuperando monitorias... (${retryCount + 1}/5)`, { id: 'mon-retry' });
              await supabase!.auth.getSession();
              await new Promise(res => setTimeout(res, waitTime));
              return executeWithRetry(retryCount + 1);
            }
            toast.dismiss('mon-retry');
            toast.error('Não foi possível conectar ao servidor. Verifique sua internet.');
            throw err;
          }
        };

        const [mRes] = await executeWithRetry();
        fetchedMonitorias = mRes.data || [];
      }

      setMonitorias(fetchedMonitorias.map((r: any) => ({ ...r, history: r.history || [], answers: r.answers || {} })));
    } catch (e: any) {
      console.error(e);
      if (e.message === 'timeout') {
        toast.error('O servidor não respondeu. Tente alternar entre os menus para recarregar.');
      }
    }
    finally {
      setLoading(false);
      hasLoadedOnce.current = true;
      fetchingRef.current = false;
      toast.dismiss('mon-retry');
    }
  }, []);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loading) {
      timer = setTimeout(() => {
        if (loading) {
          console.warn('[Monitorias] Failsafe ativado: Forçando fim do carregamento após 45s.');
          setLoading(false);
          toast.dismiss('mon-retry');
        }
      }, 45000);
    }
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (user) {
      load();
    }
  }, [user, load]);

  useEffect(() => {
    if (activeTab === 'monitorias' && user && hasLoadedOnce.current) {
      console.log('[Monitorias] Aba selecionada, recarregando...');
      load();
    }
  }, [activeTab, user, load]);

  useEffect(() => {
    const handleReconnect = () => {
      console.log('[Monitorias] Reconexão detectada. Recarregando monitorias...');
      hasLoadedOnce.current = false;
      loadRef.current();
    };
    window.addEventListener('qualitrack:reconnected', handleReconnect);
    return () => {
      window.removeEventListener('qualitrack:reconnected', handleReconnect);
    };
  }, []);

  useEffect(() => {
    if (isMockMode || !user) return;
    const sb = supabase!;

    let mounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channelName = `monitorias-realtime-list-${Math.random().toString(36).substring(2, 11)}`;
    const channel = sb
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitorias' }, () => {
        if (!mounted) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadRef.current(true);
        }, 300);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Inscrição ativa na tabela monitorias');
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] Timeout - verificar config de Realtime no Supabase');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Erro no canal - Realtime pode não estar configurado');
        } else if (status === 'CLOSED') {
          console.log('[Realtime] Canal fechado');
        }
      });

    return () => {
      mounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      sb.removeChannel(channel);
    };
  }, [user]);

  return { monitorias, setMonitorias, loading, load };
}
