import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Monitoria, User, Team, EvaluationForm } from '../../types';
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
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ user, children }: { user: User | null, children: ReactNode }) {
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
  const [loading, setLoading] = useState(true);
  const [globalAvg, setGlobalAvg] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let docs: Monitoria[] = [];
      let scoreDocs: any[] = [];
      let userDocs: User[] = [];
      let teamDocs: Team[] = [];
      let formDocs: EvaluationForm[] = [];

      if (!supabase) {
        docs = (await mockDb.get('monitorias')).data || [];
        scoreDocs = docs;
        userDocs = (await mockDb.get('users')).data || [];
        teamDocs = (await mockDb.get('teams')).data || [];
        formDocs = (await mockDb.get('forms')).data || [];
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
              supabase.from('forms').select('*').abortSignal(controller.signal)
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

        const [mRes, sRes, uRes, tRes, fRes] = await executeWithRetry();
        
        if (mRes.data) docs = mRes.data as Monitoria[];
        if (sRes.data) scoreDocs = sRes.data;
        if (uRes.data) userDocs = uRes.data as User[];
        if (tRes.data) teamDocs = tRes.data as Team[];
        if (fRes.data) formDocs = fRes.data as EvaluationForm[];
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
    }
  }, [user, filters, refreshTrigger]);

  // Debounce the loadData effect when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Listener de reconexão automática
  useEffect(() => {
    const handleReconnect = () => {
      console.log('[Dashboard] 🔄 Reconexão detectada. Recarregando dados...');
      loadData();
    };
    window.addEventListener('qualitrack:reconnected', handleReconnect);
    return () => window.removeEventListener('qualitrack:reconnected', handleReconnect);
  }, [loadData]);

  const refresh = useCallback(() => setRefreshTrigger(prev => prev + 1), []);

  return (
    <DashboardContext.Provider value={{ user, filters, setFilters, monitorias, allMonitorias, users, teams, forms, loading, globalAvg, refresh }}>
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
