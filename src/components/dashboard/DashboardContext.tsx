import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Monitoria, User, Team, EvaluationForm, DissatisfactionField } from '../../types';
import { supabase, mockDb } from '../../lib/supabase';
import { useStaticData } from '../../lib/StaticDataContext';
import { toast } from 'sonner';

export interface DashboardFilters {
  startDate: string;
  endDate: string;
  teamId: string;
  agentId: string;
  auditorId: string;
  formId: string;
  status: string;
  channel: string;
}

interface DashboardContextType {
  user: User | null;
  loggedInUser: User | null;
  dashboardRole: 'admin' | 'gestor_qualidade' | 'gestor_suporte' | 'qualidade' | 'suporte';
  isSimulated: boolean;
  filters: DashboardFilters;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
  monitorias: Monitoria[];
  allMonitorias: Monitoria[];
  users: User[];
  teams: Team[];
  forms: EvaluationForm[];
  loading: boolean;
  globalAvg: number;
  refresh: () => void;
  onlineUsers: User[];
  dissatisfactionFields: DissatisfactionField[];
  activeEditingId: string | null;
  setActiveEditingId: React.Dispatch<React.SetStateAction<string | null>>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ 
  user: loggedInUser, 
  activeTab, 
  children 
}: { 
  user: User | null, 
  activeTab?: string, 
  children: ReactNode 
}) {
  const staticData = useStaticData();

  const dashboardRole = loggedInUser?.role || 'suporte';
  const isSimulated = false;
  const user = loggedInUser;

  const [filters, setFilters] = useState<DashboardFilters>({
    startDate: new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    teamId: '',
    agentId: '',
    auditorId: '',
    formId: '',
    status: '',
    channel: ''
  });

  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [allMonitorias, setAllMonitorias] = useState<Monitoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalAvg, setGlobalAvg] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeEditingId, setActiveEditingId] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);
  const fetchingRef = useRef(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const userRef = useRef(user);
  userRef.current = user;
  const staticDataRef = useRef(staticData);
  staticDataRef.current = staticData;

const loadData = useCallback(async () => {
  const currentUser = userRef.current;
  if (!currentUser) return;
  if (fetchingRef.current) {
    console.log('[Dashboard] Fetch já em andamento, ignorando...');
    return;
  }
  fetchingRef.current = true;
  if (!hasLoadedOnce.current) {
    setLoading(true);
  }
    try {
      let docs: Monitoria[] = [];
      let scoreDocs: any[] = [];
      const currentFilters = filtersRef.current;
      const currentStaticData = staticDataRef.current;

      if (!supabase) {
        const { data } = await mockDb.get('monitorias');
        docs = data || [];
        scoreDocs = docs;
      } else {
        const executeWithRetry = async (retryCount = 0): Promise<any[]> => {
          try {
            console.log(`[Dashboard] Carregando monitorias (Tentativa ${retryCount + 1})...`);
            const controller = new AbortController();

            let monitoriasQuery = supabase.from('monitorias').select('*').order('created_at', { ascending: false });
            let scoresQuery = supabase.from('monitorias').select('score, created_at, status, channel, form_id, active');

            const myTeamIds = currentUser.team_ids || [];

            if (currentUser.role === 'suporte') {
              if (myTeamIds.length > 0) {
                monitoriasQuery = monitoriasQuery.or(`evaluated_id.eq.${currentUser.id},team_id.in.(${myTeamIds.map(id => `"${id}"`).join(',')})`);
              } else {
                monitoriasQuery = monitoriasQuery.eq('evaluated_id', currentUser.id);
              }
            } else if (currentUser.role === 'qualidade') {
              monitoriasQuery = monitoriasQuery.eq('evaluator_id', currentUser.id);
            } else if (currentUser.role === 'gestor_suporte') {
              if (myTeamIds.length > 0) {
                monitoriasQuery = monitoriasQuery.in('team_id', myTeamIds);
              } else {
                monitoriasQuery = monitoriasQuery.eq('team_id', '00000000-0000-0000-0000-000000000000');
              }
            }

            const fetchPromise = Promise.all([
              monitoriasQuery.abortSignal(controller.signal),
              scoresQuery.abortSignal(controller.signal),
            ]);

            const timeoutPromise = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 15000));

            const results = await Promise.race([fetchPromise, timeoutPromise]) as any[];

            const errorRes = results.find((r: any) => r.error);
            if (errorRes) throw errorRes.error;

            return results;
          } catch (err: any) {
            console.error(`[Dashboard] Erro na tentativa ${retryCount + 1}:`, err);
            if (retryCount < 4) {
              const waitTime = Math.min(1000 * Math.pow(1.5, retryCount) + 1000 * retryCount, 10000);
              toast.loading(`Recuperando dashboard... (${retryCount + 1}/5)`, { id: 'dash-retry' });
              await supabase.auth.getSession();
              await new Promise(res => setTimeout(res, waitTime));
              return executeWithRetry(retryCount + 1);
            }
            toast.dismiss('dash-retry');
            toast.error('Não foi possível conectar ao servidor. Verifique sua internet.');
            throw err;
          }
        };

        const [mRes, sRes] = await executeWithRetry();

        if (mRes.data) docs = mRes.data as Monitoria[];
        if (sRes.data) scoreDocs = sRes.data;
      }

      const userDocs = currentStaticData.users;
      const teamDocs = currentStaticData.teams;
      const formDocs = currentStaticData.forms;

      docs = docs.filter(m => m.active !== false);

      const globalFiltered = scoreDocs.filter(m => {
        if (m.active === false) return false;
        const targetDate = m.created_at;
        if (!targetDate) return true;
        const d = new Date(targetDate).getTime();
        const startD = currentFilters.startDate ? new Date(currentFilters.startDate).getTime() : 0;
        const endD = currentFilters.endDate ? new Date(currentFilters.endDate + 'T23:59:59').getTime() : Infinity;

        let pass = d >= startD && d <= endD;
        if (currentFilters.status) pass = pass && m.status === currentFilters.status;
        if (currentFilters.channel) pass = pass && m.channel === currentFilters.channel;
        if (currentFilters.formId) pass = pass && m.form_id === currentFilters.formId;
        return pass;
      });
      const gAvg = globalFiltered.length > 0 ? globalFiltered.reduce((acc, m) => acc + (m.score || 0), 0) / globalFiltered.length : 0;

      if (currentUser.role === 'suporte') {
        const myUser = userDocs.find(u => u.id === currentUser.id);
        let myTeamIds = myUser?.team_ids || currentUser.team_ids || [];

        if (myTeamIds.length === 0) {
          const fromRecords = docs.filter(m => m.evaluated_id === currentUser.id && m.team_id).map(m => m.team_id!);
          myTeamIds = Array.from(new Set(fromRecords));
        }

        docs = docs.filter(m => m.evaluated_id === currentUser.id || (m.team_id && myTeamIds.includes(m.team_id)));
      } else if (currentUser.role === 'qualidade') {
        docs = docs.filter(m => m.evaluator_id === currentUser.id);
      } else if (currentUser.role === 'gestor_suporte') {
        const myTeamIds = currentUser.team_ids || [];
        docs = docs.filter(m => myTeamIds.includes(m.team_id));
      } else if (currentUser.role === 'gestor_qualidade') {
      }

      setAllMonitorias(docs);

      let filtered = docs.filter(m => {
        const targetDate = m.created_at;
        if (!targetDate) return true;
        const d = new Date(targetDate).getTime();
        const startD = currentFilters.startDate ? new Date(currentFilters.startDate).getTime() : 0;
        const endD = currentFilters.endDate ? new Date(currentFilters.endDate + 'T23:59:59').getTime() : Infinity;
        return d >= startD && d <= endD;
      });

      if (currentFilters.teamId) filtered = filtered.filter(m => m.team_id === currentFilters.teamId);
      if (currentFilters.agentId && currentUser.role !== 'suporte') filtered = filtered.filter(m => m.evaluated_id === currentFilters.agentId);
      if (currentFilters.auditorId) filtered = filtered.filter(m => m.evaluator_id === currentFilters.auditorId);
      if (currentFilters.formId) filtered = filtered.filter(m => m.form_id === currentFilters.formId);
      if (currentFilters.status) filtered = filtered.filter(m => m.status === currentFilters.status);
      if (currentFilters.channel) filtered = filtered.filter(m => m.channel === currentFilters.channel);

      setMonitorias(filtered);
      setGlobalAvg(gAvg);
    } catch (e: any) {
      console.error(e);
      if (e.message === 'timeout') {
        import('sonner').then(({ toast }) => {
          toast.error('A conexão expirou. Por favor, atualize a página (F5).');
        });
      }
} finally {
    setLoading(false);
    hasLoadedOnce.current = true;
    fetchingRef.current = false;
  }
  }, [refreshTrigger]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [user, loadData]);

  useEffect(() => {
    if (activeTab === 'dashboard' && user) {
      if (hasLoadedOnce.current) {
        loadData();
      }
    }
  }, [activeTab, user, loadData]);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  useEffect(() => {
    const handleReconnect = () => {
      console.log('[Dashboard] Reconexão detectada. Recarregando monitorias...');
      hasLoadedOnce.current = false;
      loadDataRef.current();
    };
    window.addEventListener('qualitrack:reconnected', handleReconnect);
    return () => {
      window.removeEventListener('qualitrack:reconnected', handleReconnect);
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    if (!user) return;

    let mounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel('monitorias-realtime-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitorias' }, () => {
        if (!mounted) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadDataRef.current();
        }, 300);
      })
      .subscribe();

    return () => {
      mounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!user) {
      setOnlineUsers([]);
      return;
    }

    const HEARTBEAT_INTERVAL = 10000;
    const SESSION_TIMEOUT = 25000;

    const performLocalHeartbeat = () => {
      try {
        const storedStr = localStorage.getItem('qualitrack_active_sessions');
        let sessions = storedStr ? JSON.parse(storedStr) : [];
        if (!Array.isArray(sessions)) sessions = [];

        const now = Date.now();
        sessions = sessions.filter((s: any) =>
          s && s.id && s.lastActive && (now - s.lastActive < SESSION_TIMEOUT) && s.id !== user.id
        );

        sessions.push({
          id: user.id,
          name: user.name,
          role: user.role,
          email: user.email,
          active: true,
          lastActive: now
        });

        localStorage.setItem('qualitrack_active_sessions', JSON.stringify(sessions));
        return sessions.map((s: any) => ({
          id: s.id,
          name: s.name,
          role: s.role,
          email: s.email,
          active: true,
          created_at: s.created_at || new Date().toISOString()
        })) as User[];
      } catch (e) {
        console.error('[Presence] Error updating local heartbeat:', e);
        return [];
      }
    };

    let localSessions = performLocalHeartbeat();
    let presenceSessions: User[] = [];
    let channel: any = null;

    const updateCombinedOnlineUsers = (local: User[], remote: User[]) => {
      const userMap = new Map<string, User>();
      local.forEach(u => userMap.set(u.id, u));
      remote.forEach(u => userMap.set(u.id, u));
      const merged = Array.from(userMap.values());
      setOnlineUsers(merged);
    };

    updateCombinedOnlineUsers(localSessions, presenceSessions);

    if (supabase) {
      channel = supabase.channel('online-presence', {
        config: {
          presence: {
            key: user.id,
          },
        },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          try {
            const presenceState = channel.presenceState();
            const remote = Object.values(presenceState)
              .flatMap((presences: any) => presences || [])
              .filter((p: any) => p && p.user_id)
              .map((p: any) => ({
                id: p.user_id,
                name: p.name,
                role: p.role,
                email: p.email,
                active: true,
                created_at: p.created_at || new Date().toISOString()
              }));

            presenceSessions = remote;
            updateCombinedOnlineUsers(performLocalHeartbeat(), presenceSessions);
          } catch (e) {
            console.error('[Presence] Sync event error:', e);
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            try {
              await channel.track({
                user_id: user.id,
                name: user.name,
                role: user.role,
                email: user.email,
                online_at: new Date().toISOString()
              });
            } catch (e) {
              console.error('[Presence] Track error:', e);
            }
          }
        });
    }

    const timer = setInterval(() => {
      const activeLocal = performLocalHeartbeat();
      updateCombinedOnlineUsers(activeLocal, presenceSessions);
    }, HEARTBEAT_INTERVAL);

    const handleUnload = () => {
      try {
        const storedStr = localStorage.getItem('qualitrack_active_sessions');
        if (storedStr) {
          let sessions = JSON.parse(storedStr);
          if (Array.isArray(sessions)) {
            sessions = sessions.filter((s: any) => s && s.id !== user.id);
            localStorage.setItem('qualitrack_active_sessions', JSON.stringify(sessions));
          }
        }
        if (channel) {
          channel.unsubscribe();
        }
      } catch (e) {}
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload();
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [user]);

  const refresh = useCallback(() => {
    hasLoadedOnce.current = false;
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <DashboardContext.Provider value={{
      user,
      loggedInUser,
      dashboardRole,
      isSimulated,
      filters,
      setFilters,
      monitorias,
      allMonitorias,
      users: staticData.users,
      teams: staticData.teams,
      forms: staticData.forms,
      loading,
      globalAvg,
      refresh,
      onlineUsers,
      dissatisfactionFields: staticData.dissatisfactionFields,
      activeEditingId,
      setActiveEditingId
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
