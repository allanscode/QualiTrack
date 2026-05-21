import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Monitoria, User, Team, EvaluationForm, DissatisfactionField } from '../../types';
import { supabase, mockDb } from '../../lib/supabase';
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
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ user, activeTab, children }: { user: User | null, activeTab?: string, children: ReactNode }) {
  const [filters, setFilters] = useState<DashboardFilters>({
    startDate: new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0], // Default 30 days
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
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [dissatisfactionFields, setDissatisfactionFields] = useState<DissatisfactionField[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalAvg, setGlobalAvg] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const hasLoadedOnce = useRef(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    if (!hasLoadedOnce.current) {
      setLoading(true);
    }
    try {
      let docs: Monitoria[] = [];
      let scoreDocs: any[] = [];
      let userDocs: User[] = [];
      let teamDocs: Team[] = [];
      let formDocs: EvaluationForm[] = [];
      let dfDocs: DissatisfactionField[] = [];

      if (!supabase) {
        const [mRes, uRes, tRes, fRes, dfRes] = await Promise.all([
          mockDb.get('monitorias'),
          mockDb.get('users'),
          mockDb.get('teams'),
          mockDb.get('forms'),
          mockDb.get('dissatisfaction_fields')
        ]);
        docs = mRes.data || [];
        scoreDocs = docs;
        userDocs = uRes.data || [];
        teamDocs = tRes.data || [];
        formDocs = fRes.data || [];
        dfDocs = dfRes.data || [];
      } else {
        const executeWithRetry = async (retryCount = 0): Promise<any[]> => {
          try {
            console.log(`[Dashboard] Carregando dados (Tentativa ${retryCount + 1})...`);
            const controller = new AbortController();
            
            let monitoriasQuery = supabase.from('monitorias').select('*').order('created_at', { ascending: false });
            let scoresQuery = supabase.from('monitorias').select('score, created_at, status, channel, form_id, active');

            const myTeamIds = user.team_ids || [];

            if (user.role === 'suporte') {
              if (myTeamIds.length > 0) {
                monitoriasQuery = monitoriasQuery.or(`evaluated_id.eq.${user.id},team_id.in.(${myTeamIds.map(id => `"${id}"`).join(',')})`);
              } else {
                monitoriasQuery = monitoriasQuery.eq('evaluated_id', user.id);
              }
            } else if (user.role === 'qualidade') {
              monitoriasQuery = monitoriasQuery.eq('evaluator_id', user.id);
            } else if (user.role === 'gestor_suporte') {
              if (myTeamIds.length > 0) {
                monitoriasQuery = monitoriasQuery.in('team_id', myTeamIds);
              } else {
                monitoriasQuery = monitoriasQuery.eq('team_id', '00000000-0000-0000-0000-000000000000');
              }
            }

            const fetchPromise = Promise.all([
              monitoriasQuery.abortSignal(controller.signal),
              scoresQuery.abortSignal(controller.signal),
              supabase.from('users').select('*').abortSignal(controller.signal),
              supabase.from('teams').select('*').abortSignal(controller.signal),
              supabase.from('forms').select('*').abortSignal(controller.signal),
              supabase.from('dissatisfaction_fields').select('*').abortSignal(controller.signal)
            ]);
            
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => {
                controller.abort();
                reject(new Error('timeout'));
              }, 15000)
            );

            const results = await Promise.race([fetchPromise, timeoutPromise]) as any[];
            const errorRes = results.find(r => r.error);
            if (errorRes) throw errorRes.error;

            return results;
          } catch (err: any) {
            console.error(`[Dashboard] Erro na tentativa ${retryCount + 1}:`, err);
            if (retryCount < 4) { // Até 5 tentativas
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

        const [mRes, sRes, uRes, tRes, fRes, dfRes] = await executeWithRetry();
        
        if (mRes.data) docs = mRes.data as Monitoria[];
        if (sRes.data) scoreDocs = sRes.data;
        if (uRes.data) userDocs = uRes.data as User[];
        if (tRes.data) teamDocs = tRes.data as Team[];
        if (fRes.data) formDocs = fRes.data as EvaluationForm[];
        if (dfRes.data) dfDocs = dfRes.data as DissatisfactionField[];
      }

      // Always exclude deactivated monitorias from dashboard
      docs = docs.filter(m => m.active !== false);

      // Calculate Global Average (filtered only by date/status/channel, not RBAC)
      const globalFiltered = scoreDocs.filter(m => {
        if (m.active === false) return false;
        const targetDate = m.created_at;
        if (!targetDate) return true;
        const d = new Date(targetDate).getTime();
        const startD = filters.startDate ? new Date(filters.startDate).getTime() : 0;
        const endD = filters.endDate ? new Date(filters.endDate + 'T23:59:59').getTime() : Infinity;
        
        let pass = d >= startD && d <= endD;
        if (filters.status) pass = pass && m.status === filters.status;
        if (filters.channel) pass = pass && m.channel === filters.channel;
        if (filters.formId) pass = pass && m.form_id === filters.formId;
        return pass;
      });
      const gAvg = globalFiltered.length > 0 ? globalFiltered.reduce((acc, m) => acc + (m.score || 0), 0) / globalFiltered.length : 0;

      // Base RBAC for raw data (RLS should handle this in Supabase, but we do it here for mockDb and extra safety)
      if (user.role === 'suporte') {
        const myUser = userDocs.find(u => u.id === user.id);
        let myTeamIds = myUser?.team_ids || user.team_ids || [];
        
        if (myTeamIds.length === 0) {
          const fromRecords = docs.filter(m => m.evaluated_id === user.id && m.team_id).map(m => m.team_id!);
          myTeamIds = Array.from(new Set(fromRecords));
        }

        docs = docs.filter(m => m.evaluated_id === user.id || (m.team_id && myTeamIds.includes(m.team_id)));
      } else if (user.role === 'qualidade') {
        docs = docs.filter(m => m.evaluator_id === user.id);
      } else if (user.role === 'gestor_suporte') {
        const myTeamIds = user.team_ids || [];
        // Vê apenas monitorias das suas equipes
        docs = docs.filter(m => myTeamIds.includes(m.team_id));
      } else if (user.role === 'gestor_qualidade') {
        // Gestor de Qualidade vê tudo por padrão para gerir a qualidade global
      }

      // Save RBAC-filtered list before UI filters
      setAllMonitorias(docs);

      // Apply Global Context Filters
      let filtered = docs.filter(m => {
        const targetDate = m.created_at;
        if (!targetDate) return true;
        const d = new Date(targetDate).getTime();
        const startD = filters.startDate ? new Date(filters.startDate).getTime() : 0;
        const endD = filters.endDate ? new Date(filters.endDate + 'T23:59:59').getTime() : Infinity;
        return d >= startD && d <= endD;
      });

      if (filters.teamId) filtered = filtered.filter(m => m.team_id === filters.teamId);
      if (filters.agentId && user.role !== 'suporte') filtered = filtered.filter(m => m.evaluated_id === filters.agentId);
      if (filters.auditorId) filtered = filtered.filter(m => m.evaluator_id === filters.auditorId);
      if (filters.formId) filtered = filtered.filter(m => m.form_id === filters.formId);
      if (filters.status) filtered = filtered.filter(m => m.status === filters.status);
      if (filters.channel) filtered = filtered.filter(m => m.channel === filters.channel);

      setMonitorias(filtered);
      setUsers(userDocs);
      setTeams(teamDocs);
      setForms(formDocs);
      setDissatisfactionFields(dfDocs);
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
    }
  }, [user, filters, refreshTrigger]);

  // Debounce the loadData effect when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Recarrega sempre que a aba do dashboard for focada/exibida
  useEffect(() => {
    if (activeTab === 'dashboard') {
      console.log('[Dashboard] Aba selecionada, recarregando...');
      loadData();
    }
  }, [activeTab, loadData]);

  // Listener de reconexão automática e recarga de monitorias
  useEffect(() => {
    const handleReconnect = () => {
      console.log('[Dashboard] 🔄 Reconexão detectada. Recarregando dados...');
      loadData();
    };
    const handleRefresh = () => {
      console.log('[Dashboard] 🔄 Notificação de nova monitoria recebida. Recarregando dados...');
      loadData();
    };
    window.addEventListener('qualitrack:reconnected', handleReconnect);
    window.addEventListener('qualitrack:refresh-monitorias', handleRefresh);
    return () => {
      window.removeEventListener('qualitrack:reconnected', handleReconnect);
      window.removeEventListener('qualitrack:refresh-monitorias', handleRefresh);
    };
  }, [loadData]);

  // Realtime Supabase updates
  useEffect(() => {
    if (!supabase) return;
    
    console.log('[Dashboard] 🔌 Conectando canal Realtime Postgres...');
    const channel = supabase
      .channel('monitorias-realtime-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitorias' }, (payload) => {
        console.log('[Dashboard] ⚡ Alteração Postgres recebida via Realtime:', payload);
        loadData();
      })
      .subscribe();

    return () => {
      console.log('[Dashboard] 🔌 Desconectando canal Realtime Postgres...');
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!user) {
      setOnlineUsers([]);
      return;
    }

    // 1. Local Storage Heartbeat (works across tabs/browsers on same machine)
    const HEARTBEAT_INTERVAL = 10000; // 10s
    const SESSION_TIMEOUT = 25000;    // 25s

    const performLocalHeartbeat = () => {
      try {
        const storedStr = localStorage.getItem('qualitrack_active_sessions');
        let sessions = storedStr ? JSON.parse(storedStr) : [];
        if (!Array.isArray(sessions)) sessions = [];

        const now = Date.now();
        // Remove expired sessions or sessions of this user (which we will re-add)
        sessions = sessions.filter((s: any) => 
          s && s.id && s.lastActive && (now - s.lastActive < SESSION_TIMEOUT) && s.id !== user.id
        );

        // Add current user session
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

    // Initial heartbeat
    let localSessions = performLocalHeartbeat();

    // 2. Supabase Realtime Presence
    let presenceSessions: User[] = [];
    let channel: any = null;

    const updateCombinedOnlineUsers = (local: User[], remote: User[]) => {
      // Merge unique users by ID
      const userMap = new Map<string, User>();
      
      // Local first
      local.forEach(u => userMap.set(u.id, u));
      
      // Remote next (overwrites/adds from other machines)
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

    // Interval for local heartbeat and refreshing online state
    const timer = setInterval(() => {
      const activeLocal = performLocalHeartbeat();
      updateCombinedOnlineUsers(activeLocal, presenceSessions);
    }, HEARTBEAT_INTERVAL);

    // Unload cleanup: remove current user session from local storage immediately when closing tab
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
    };
  }, [user]);

  const refresh = useCallback(() => setRefreshTrigger(prev => prev + 1), []);

  return (
    <DashboardContext.Provider value={{ user, filters, setFilters, monitorias, allMonitorias, users, teams, forms, loading, globalAvg, refresh, onlineUsers, dissatisfactionFields }}>
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
