import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Monitoria, User, Team, EvaluationForm } from '../../types';
import { supabase, mockDb } from '../../lib/supabase';

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
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let docs: Monitoria[] = [];
      let userDocs: User[] = [];
      let teamDocs: Team[] = [];
      let formDocs: EvaluationForm[] = [];

      if (!supabase) {
        docs = (await mockDb.get('monitorias')).data || [];
        userDocs = (await mockDb.get('users')).data || [];
        teamDocs = (await mockDb.get('teams')).data || [];
        formDocs = (await mockDb.get('forms')).data || [];
      } else {
        const [mRes, uRes, tRes, fRes] = await Promise.all([
          supabase.from('monitorias').select('*').order('created_at', { ascending: false }),
          supabase.from('users').select('*'),
          supabase.from('teams').select('*'),
          supabase.from('forms').select('*')
        ]);
        docs = (mRes.data || []) as Monitoria[];
        userDocs = (uRes.data || []) as User[];
        teamDocs = (tRes.data || []) as Team[];
        formDocs = (fRes.data || []) as EvaluationForm[];
      }

      // Always exclude deactivated monitorias from dashboard
      docs = docs.filter(m => m.active !== false);

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
      } else if (user.role === 'gestor_suporte' || user.role === 'gestor_qualidade') {
        const myTeamIds = user.team_ids || [];
        const myTeamUserIds = userDocs.filter(u => u.team_ids?.some(tid => myTeamIds.includes(tid))).map(u => u.id);
        docs = docs.filter(m => myTeamUserIds.includes(m.evaluated_id) || myTeamUserIds.includes(m.evaluator_id));
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
    } catch (e) {
      console.error(e);
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

  const refresh = useCallback(() => setRefreshTrigger(prev => prev + 1), []);

  return (
    <DashboardContext.Provider value={{ user, filters, setFilters, monitorias, allMonitorias, users, teams, forms, loading, refresh }}>
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
