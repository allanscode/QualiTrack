import { usePageCache } from '../../hooks/usePageCache';
import { useBackgroundRefresh } from '../../hooks/useBackgroundRefresh';
import { userCacheScope } from '../../lib/pageCache';
import { matchesTicketGroup } from '../../lib/dashboardGroupFilter';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { Monitoria, User, Team, EvaluationForm, DissatisfactionField, HelpdeskSubmission } from '../../types';
import { supabase, mockDb, isMockMode } from '../../lib/supabase';
import { useStaticData } from '../../lib/StaticDataContext';
import { toast } from 'sonner';
import { useQualityConfig } from '../../lib/useQualityConfig';
import { getRemainingBusinessSeconds } from '../../lib/businessHours';
import { getPresetDateRange } from '../../lib/dashboardDatePresets';
import { getTrendWindowStart } from '../../lib/performanceTrend';
import { QUALITY_MANAGER_ACTION_STATUSES, selectQualityManagerActions } from '../../lib/qualityManagerQueue';

export interface DashboardFilters {
  startDate: string;
  endDate: string;
  teamId: string;
  groupId?: string;
  agentId: string;
  auditorId: string;
  formId: string;
  status: string;
  channel: string;
}

export interface DashboardAggregateGroup {
  id: string | null;
  count: number;
}

export interface DashboardAggregateRanking extends DashboardAggregateGroup {
  id: string;
  average: number;
  score?: number;
  badness?: number;
}

export interface DashboardAggregatePeriod {
  period: string;
  count: number;
  average: number;
}

export interface DashboardAggregates {
  total: number;
  scored: number;
  average: number;
  ranking_baseline: number;
  agents: DashboardAggregateRanking[];
  auditors: DashboardAggregateRanking[];
  teams: DashboardAggregateGroup[];
  groups: DashboardAggregateGroup[];
  statuses: DashboardAggregateGroup[];
  days: DashboardAggregatePeriod[];
  months: DashboardAggregatePeriod[];
  years: DashboardAggregatePeriod[];
}

// Dashboard widgets use these fields for their visible rows and drilldowns.
// Keep the projection explicit so new large columns are never fetched by default.
const DASHBOARD_MONITORIA_COLUMNS = [
  'id', 'display_id', 'form_id', 'child_verdict', 'evaluator_id', 'evaluated_id', 'evaluator_name',
  'evaluated_name', 'team_id', 'team_name', 'ticket_group_team_id',
  'form_name', 'ticket_id', 'channel', 'ticket_date', 'analysis_date',
  'satisfaction_result', 'satisfaction_has_record', 'satisfaction_record_text',
  'answers', 'score', 'status', 'resolution_type', 'contestation_result',
  'action_deadline_at', 'active', 'history', 'dissatisfaction_answers',
  'created_at', 'updated_at', 'evaluator_note', 'question_observations',
  'critical_error_observations', 'selected_critical_errors',
  'client_contact_log', 'client_contact_success', 'client_contact_channel',
  'form_snapshot', 'contestation_reason', 'corrective_action',
  'action_attachments',
].join(',');

// Trends and pending actions span the whole history, but need only small fields.
const DASHBOARD_SUMMARY_COLUMNS = [
  'id', 'display_id', 'form_id', 'child_verdict', 'evaluator_id', 'evaluated_id', 'evaluator_name',
  'evaluated_name', 'team_id', 'team_name', 'ticket_group_team_id',
  'form_name', 'ticket_id', 'channel', 'ticket_date', 'analysis_date',
  'satisfaction_result', 'score', 'status', 'resolution_type',
  'contestation_result', 'action_deadline_at', 'active', 'created_at',
  'updated_at',
].join(',');

// Admin and quality dashboards use history for trends, rankings, average and
// SLA alerts. Their period drilldowns come from the separate detail query.
const DASHBOARD_METRICS_COLUMNS = [
  'id', 'display_id', 'form_id', 'child_verdict', 'evaluator_id', 'evaluated_id', 'team_id',
  'ticket_group_team_id', 'channel', 'score', 'status',
  'action_deadline_at', 'active', 'created_at',
].join(',');

export interface DashboardState {
  user: User | null;
  loggedInUser: User | null;
  dashboardRole: 'admin' | 'gestor_qualidade' | 'gestor_suporte' | 'qualidade' | 'suporte';
  isSimulated: boolean;
  filters: DashboardFilters;
  monitorias: Monitoria[];
  allMonitorias: Monitoria[];
  qualityManagerQueue: Monitoria[];
  helpdeskSubmissions: HelpdeskSubmission[];
  users: User[];
  teams: Team[];
  forms: EvaluationForm[];
  loading: boolean;
  refreshing?: boolean;
  globalAvg: number;
  aggregates?: DashboardAggregates | null;
  dissatisfactionFields: DissatisfactionField[];
  // CORRECTION 8: Cooldown for manual refresh button
  refreshCooldownEnd: number | null;
  refreshCooldownRemaining: string;
}

export interface DashboardDispatch {
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
  refresh: () => void;
}

export interface EditingContextType {
  activeEditingId: string | null;
  setActiveEditingId: React.Dispatch<React.SetStateAction<string | null>>;
}

export const EditingContext = createContext<EditingContextType | undefined>(undefined);

export const DashboardStateContext = createContext<DashboardState | undefined>(undefined);
export const DashboardDispatchContext = createContext<DashboardDispatch | undefined>(undefined);

export function useDashboardState() {
  const context = React.use(DashboardStateContext);
  if (context === undefined) {
    throw new Error('useDashboardState must be used within a DashboardStateContext Provider');
  }
  return context;
}

export function useDashboardDispatch() {
  const context = React.use(DashboardDispatchContext);
  if (context === undefined) {
    throw new Error('useDashboardDispatch must be used within a DashboardDispatchContext Provider');
  }
  return context;
}

export function useEditing() {
  const context = React.use(EditingContext);
  if (context === undefined) {
    throw new Error('useEditing must be used within an EditingContext Provider');
  }
  return context;
}

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

  const cache = usePageCache<{
    filters: DashboardFilters; monitorias: Monitoria[]; allMonitorias: Monitoria[];
    detailMonitorias?: Monitoria[];
    helpdeskSubmissions: HelpdeskSubmission[]; globalAvg: number;
  }>(userCacheScope(user), 'dashboard');
  const cached = cache.initial;
  const successfulLoad = useRef(Boolean(cached));

  const [filters, setFilters] = useState<DashboardFilters>(() => cached?.filters ?? ({
    ...getPresetDateRange('mes'),
    teamId: '',
    groupId: '',
    agentId: '',
    auditorId: '',
    formId: '',
    status: '',
    channel: ''
  }));

  const [monitorias, setMonitorias] = useState<Monitoria[]>(cached?.monitorias ?? []);
  const [allMonitorias, setAllMonitorias] = useState<Monitoria[]>(cached?.allMonitorias ?? []);
  const [detailMonitorias, setDetailMonitorias] = useState<Monitoria[]>(cached?.detailMonitorias ?? cached?.allMonitorias ?? cached?.monitorias ?? []);
  const [helpdeskSubmissions, setHelpdeskSubmissions] = useState<HelpdeskSubmission[]>(cached?.helpdeskSubmissions ?? []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [globalAvg, setGlobalAvg] = useState(cached?.globalAvg ?? 0);
  const [aggregates, setAggregates] = useState<DashboardAggregates | null>(null);
  const [deadlineMonitorias, setDeadlineMonitorias] = useState<Monitoria[]>([]);
  const [qualityManagerQueue, setQualityManagerQueue] = useState<Monitoria[]>([]);
  const [deadlineReady, setDeadlineReady] = useState(!['admin', 'qualidade', 'gestor_qualidade'].includes(dashboardRole));
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeEditingId, setActiveEditingId] = useState<string | null>(null);
  // CORRECTION 8: Cooldown for manual refresh button
  const [refreshCooldownEnd, setRefreshCooldownEnd] = useState<number | null>(null);
  const [refreshCooldownRemaining, setRefreshCooldownRemaining] = useState<string>('');
  const hasLoadedOnce = useRef(Boolean(cached));
  const loadedRangeRef = useRef(cached ? `${cached.filters.startDate}|${cached.filters.endDate}` : '');
  const summaryDocsRef = useRef<Monitoria[] | null>(cached?.allMonitorias ?? null);
  const summaryCoverageRef = useRef(cached ? {
    startDate: ['admin', 'gestor_qualidade'].includes(dashboardRole) ? getTrendWindowStart(cached.filters) : '',
    endDate: ['admin', 'gestor_qualidade'].includes(dashboardRole) ? cached.filters.endDate : '',
  } : null);
  const fetchingRef = useRef(false);
  const queuedRef = useRef(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const userRef = useRef(user);
  userRef.current = user;
  const staticDataRef = useRef(staticData);
  staticDataRef.current = staticData;

  const loadData = useCallback(async (reuseSummary = false) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const requestedRange = `${filtersRef.current.startDate}|${filtersRef.current.endDate}`;
    if (fetchingRef.current) {
      queuedRef.current = true;
      return;
    }
    fetchingRef.current = true;
    setRefreshing(true);
    if (!hasLoadedOnce.current) {
      setLoading(true);
    }
    try {
      let docs: Monitoria[] = [];
      let summaryDocs: Monitoria[] = [];
      let loadedSubmissions: HelpdeskSubmission[] = [];
      let scoreDocs: any[] = [];
      const currentStaticData = staticDataRef.current;

      if (!supabase) {
        const { data } = await mockDb.get('monitorias');
        docs = data || [];
        summaryDocs = docs;
        scoreDocs = summaryDocs;
        const { data: subData } = await mockDb.get('helpdesk_submissions');
        if (!cache.isCurrent()) return;
        loadedSubmissions = (subData as HelpdeskSubmission[]) || [];
      } else {
        const sb = supabase!; // TypeScript narrowing after guard
        const executeWithRetry = async (columns: string, period: DashboardFilters, retryCount = 0): Promise<Monitoria[]> => {
          try {
            console.log(`[Dashboard] Carregando monitorias (Tentativa ${retryCount + 1})...`);
            // Fetch every page; the default Supabase row cap would distort the
            // General ranking once the history grows beyond one page.
            // Use anonymized view for suporte to hide evaluator identity
            const isSuporte = currentUser.role === 'suporte';
            const source = isSuporte ? 'vw_monitorias_suporte' : 'monitorias';
            const myTeamIds = currentUser.team_ids || [];
            const pageSize = 500;
            const rows: Monitoria[] = [];
            for (let offset = 0; ; offset += pageSize) {
              let query = sb.from(source).select(columns)
                .eq('active', true)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .range(offset, offset + pageSize - 1);
              if (period.startDate) query = query.gte('created_at', new Date(`${period.startDate}T00:00:00`).toISOString());
              if (period.endDate) query = query.lte('created_at', new Date(`${period.endDate}T23:59:59`).toISOString());
              if (currentUser.role === 'suporte') {
                if (myTeamIds.length > 0) {
                  const rbacFilter = `evaluated_id.eq.${currentUser.id},team_id.in.(${myTeamIds.map(id => `"${id}"`).join(',')})`;
                  query = query.or(rbacFilter);
                } else {
                  query = query.eq('evaluated_id', currentUser.id);
                }
              } else if (currentUser.role === 'gestor_suporte') {
                query = myTeamIds.length > 0
                  ? query.in('team_id', myTeamIds)
                  : query.eq('team_id', '00000000-0000-0000-0000-000000000000');
              }
              const controller = new AbortController();
              let timeoutId: ReturnType<typeof setTimeout> | undefined;
              const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 30000);
              });
              let result;
              try {
                result = await Promise.race([query.abortSignal(controller.signal), timeoutPromise]);
              } finally {
                if (timeoutId) clearTimeout(timeoutId);
              }
              if (result.error) throw result.error;
              const page = (result.data ?? []) as unknown as Monitoria[];
              rows.push(...page);
              if (page.length < pageSize) break;
            }
            return rows;
          } catch (err: any) {
          console.error(`[Dashboard] Erro na tentativa ${retryCount + 1}:`, err);
          if (retryCount < 4) {
            const waitTime = Math.min(1000 * Math.pow(1.5, retryCount) + 1000 * retryCount, 10000);
            if (!hasLoadedOnce.current) {
              toast.loading(`Recuperando dashboard... (${retryCount + 1}/5)`, { id: 'dash-retry' });
            }
            await new Promise(res => setTimeout(res, waitTime));
            return executeWithRetry(columns, period, retryCount + 1);
          }
          toast.dismiss('dash-retry');
          toast.error(hasLoadedOnce.current
            ? 'Não foi possível atualizar o dashboard. Os dados anteriores continuam visíveis.'
            : 'O servidor de dados não respondeu. Tente novamente em instantes.');
          throw err;
        }
      };

        const period = filtersRef.current;
        const boundedHistory = ['admin', 'gestor_qualidade'].includes(currentUser.role);
        const historyStart = boundedHistory ? getTrendWindowStart(period) : '';
        const historyEnd = boundedHistory ? period.endDate : '';
        const coverage = summaryCoverageRef.current;
        const summaryIsCovered = coverage && (!coverage.startDate || (historyStart && coverage.startDate <= historyStart))
          && (!coverage.endDate || (historyEnd && coverage.endDate >= historyEnd));
        const summaryColumns = ['admin', 'qualidade', 'gestor_qualidade'].includes(currentUser.role)
          ? DASHBOARD_METRICS_COLUMNS : DASHBOARD_SUMMARY_COLUMNS;
        if (currentUser.role === 'qualidade') {
          docs = await executeWithRetry(DASHBOARD_MONITORIA_COLUMNS, period);
          summaryDocs = docs;
        } else {
          [summaryDocs, docs] = await Promise.all([
            reuseSummary && summaryDocsRef.current && summaryIsCovered
              ? Promise.resolve(summaryDocsRef.current)
              : executeWithRetry(summaryColumns, { ...period, startDate: historyStart, endDate: historyEnd }),
            executeWithRetry(DASHBOARD_MONITORIA_COLUMNS, period),
          ]);
          if (!reuseSummary || !summaryDocsRef.current || !summaryIsCovered) {
            summaryDocsRef.current = summaryDocs;
            summaryCoverageRef.current = { startDate: historyStart, endDate: historyEnd };
          }
        }
        scoreDocs = ['admin', 'qualidade', 'gestor_qualidade'].includes(currentUser.role) ? docs : summaryDocs;

        if (currentUser.role === 'gestor_suporte' && docs.length > 0) {
          const docIds = docs.map(d => d.id);
          const idBatches = Array.from({ length: Math.ceil(docIds.length / 150) }, (_, index) =>
            docIds.slice(index * 150, (index + 1) * 150));
          const submissionBatches = await Promise.all(idBatches.map(async ids => {
            const { data: subData, error: subError } = await sb
              .from('helpdesk_submissions')
              .select('*')
              .in('monitoria_id', ids)
              .eq('status', 'sent')
              .order('created_at', { ascending: false });
            if (subError) throw subError;
            return (subData as HelpdeskSubmission[]) || [];
          }));
          if (!cache.isCurrent()) return;
          loadedSubmissions = submissionBatches.flat();
        } else {
          if (!cache.isCurrent()) return;
          loadedSubmissions = [];
        }
      }

      if (requestedRange !== `${filtersRef.current.startDate}|${filtersRef.current.endDate}`) {
        queuedRef.current = true;
        return;
      }
      const currentFilters = filtersRef.current;
      const userDocs = currentStaticData.users;

      docs = docs.filter(m => m.active !== false);
      summaryDocs = summaryDocs.filter(m => m.active !== false);

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
      if (currentFilters.teamId && 'team_id' in m) pass = pass && m.team_id === currentFilters.teamId;
      pass = pass && matchesTicketGroup(m, currentFilters.groupId);
      if (currentFilters.agentId && currentUser.role !== 'suporte' && 'evaluated_id' in m) pass = pass && m.evaluated_id === currentFilters.agentId;
      if (currentFilters.auditorId && 'evaluator_id' in m) pass = pass && m.evaluator_id === currentFilters.auditorId;
      return pass;
    });
      const gAvg = globalFiltered.length > 0 ? globalFiltered.reduce((acc, m) => acc + (m.score || 0), 0) / globalFiltered.length : 0;

      if (currentUser.role === 'suporte') {
        const myUser = userDocs.find(u => u.id === currentUser.id);
        let myTeamIds = myUser?.team_ids || currentUser.team_ids || [];

        if (myTeamIds.length === 0) {
          const fromRecords = summaryDocs.filter(m => m.evaluated_id === currentUser.id && m.team_id).map(m => m.team_id!);
          myTeamIds = Array.from(new Set(fromRecords));
        }

        docs = docs.filter(m => m.evaluated_id === currentUser.id || (m.team_id && myTeamIds.includes(m.team_id)));
        summaryDocs = summaryDocs.filter(m => m.evaluated_id === currentUser.id || (m.team_id && myTeamIds.includes(m.team_id)));
      } else if (currentUser.role === 'gestor_suporte') {
        const myTeamIds = currentUser.team_ids || [];
        docs = docs.filter(m => m.team_id && myTeamIds.includes(m.team_id));
        summaryDocs = summaryDocs.filter(m => m.team_id && myTeamIds.includes(m.team_id));
      } else if (currentUser.role === 'gestor_qualidade') {
      }

      if (currentUser.role === 'suporte' || currentUser.role === 'gestor_suporte') {
        scoreDocs = summaryDocs;
      }

      if (!cache.isCurrent()) return;
      successfulLoad.current = true;
      loadedRangeRef.current = requestedRange;
      setHelpdeskSubmissions(loadedSubmissions);
      setAllMonitorias(summaryDocs);
      setDetailMonitorias(docs);

      let filtered = docs.filter(m => {
        const targetDate = m.created_at;
        if (!targetDate) return true;
        const d = new Date(targetDate).getTime();
        const startD = currentFilters.startDate ? new Date(currentFilters.startDate).getTime() : 0;
        const endD = currentFilters.endDate ? new Date(currentFilters.endDate + 'T23:59:59').getTime() : Infinity;
        return d >= startD && d <= endD;
      });

      if (currentFilters.teamId) filtered = filtered.filter(m => m.team_id === currentFilters.teamId);
      filtered = filtered.filter(m => matchesTicketGroup(m, currentFilters.groupId));
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
      if (cache.isCurrent() && !queuedRef.current) { setLoading(false); setRefreshing(false); }
      hasLoadedOnce.current = successfulLoad.current;
      fetchingRef.current = false;
      toast.dismiss('dash-retry');
      if (queuedRef.current) {
        queuedRef.current = false;
        setTimeout(() => loadData(), 0);
      }
    }
  }, [refreshTrigger, cache]);

  useEffect(() => {
    if (!user) return;
    if (loadedRangeRef.current !== `${filters.startDate}|${filters.endDate}`) setLoading(true);
    const changingPeriod = hasLoadedOnce.current && loadedRangeRef.current !== `${filters.startDate}|${filters.endDate}`;
    const timer = setTimeout(() => {
      loadData(changingPeriod);
    }, hasLoadedOnce.current ? 300 : 0);
    return () => clearTimeout(timer);
  }, [user, loadData, filters.startDate, filters.endDate]);

  // Historic SLA alerts must remain visible even when chart history is bounded.
  useEffect(() => {
    if (!supabase || !user || loading || !['admin', 'qualidade', 'gestor_qualidade'].includes(user.role)) return;
    if (sessionStorage.getItem(`qualitrack_sla_notified_${user.id}`)) return;
    let cancelled = false;
    let query = supabase.from('monitorias')
      .select('id,evaluator_id,evaluated_id,team_id,status,action_deadline_at,created_at')
      .eq('active', true)
      .gte('action_deadline_at', new Date().toISOString())
      .in('status', ['pendente_revisao', 'contestacao_negada', 'em_contestacao', 'aguardando_gestor_suporte', 'aguardando_gestor_qualidade']);
    if (user.role === 'qualidade') query = query.eq('evaluator_id', user.id);
    void query.then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error('[Dashboard] Falha ao carregar alertas de prazo:', error);
      setDeadlineMonitorias((data ?? []) as Monitoria[]);
      setDeadlineReady(true);
    });
    return () => { cancelled = true; };
  }, [user, loading]);

  // The quality manager's decision queue must not depend on the dashboard date range.
  useEffect(() => {
    if (!user || user.role !== 'gestor_qualidade') {
      setQualityManagerQueue([]);
      return;
    }
    setQualityManagerQueue([]);
    let cancelled = false;
    const applyRows = (rows: Monitoria[]) => {
      if (!cancelled) setQualityManagerQueue(selectQualityManagerActions(rows));
    };
    if (isMockMode || !supabase) {
      void mockDb.get('monitorias').then(({ data }) => applyRows((data || []) as Monitoria[]));
    } else {
      void supabase.from('monitorias').select(DASHBOARD_MONITORIA_COLUMNS)
        .eq('active', true).in('status', [...QUALITY_MANAGER_ACTION_STATUSES])
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            console.error('[Dashboard] Falha ao carregar fila da Gestão da Qualidade:', error);
            return;
          }
          applyRows((data || []) as unknown as Monitoria[]);
        });
    }
    return () => { cancelled = true; };
  }, [user, refreshTrigger]);

  // Metrics and rankings are computed over the filtered, authorized set in
  // PostgreSQL. Keep MockDb's local calculations for offline development.
  useEffect(() => {
    if (!supabase || !user || activeTab !== 'dashboard') return;
    const sb = supabase;
    let cancelled = false;
    setAggregates(null);
    const timer = setTimeout(async () => {
      const { data, error } = await sb.rpc('dashboard_aggregates', {
        p_start_date: filters.startDate || null,
        p_end_date: filters.endDate || null,
        p_team_id: filters.teamId || null,
        p_group_id: filters.groupId || null,
        p_agent_id: filters.agentId || null,
        p_auditor_id: filters.auditorId || null,
        p_form_id: filters.formId || null,
        p_status: filters.status || null,
        p_channel: filters.channel || null,
      });
      if (cancelled) return;
      if (error) {
        console.error('[Dashboard] Falha ao carregar indicadores agregados:', error);
        return;
      }
      setAggregates(data as unknown as DashboardAggregates);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user, activeTab, filters, refreshTrigger]);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  // Refiltra localmente os detalhes do período; o histórico leve alimenta tendências.
  useEffect(() => {
    if (!hasLoadedOnce.current) return;
    if (loadedRangeRef.current !== `${filters.startDate}|${filters.endDate}`) return;
    const currentUser = userRef.current;
    if (!currentUser) return;

    let filtered = detailMonitorias.filter(m => {
      const targetDate = m.created_at;
      if (!targetDate) return true;
      const d = new Date(targetDate).getTime();
      const startD = filters.startDate ? new Date(filters.startDate).getTime() : 0;
      const endD = filters.endDate ? new Date(filters.endDate + 'T23:59:59').getTime() : Infinity;
      return d >= startD && d <= endD;
    });

    if (filters.teamId) filtered = filtered.filter(m => m.team_id === filters.teamId);
    filtered = filtered.filter(m => matchesTicketGroup(m, filters.groupId));
    if (filters.agentId && currentUser.role !== 'suporte') filtered = filtered.filter(m => m.evaluated_id === filters.agentId);
    if (filters.auditorId) filtered = filtered.filter(m => m.evaluator_id === filters.auditorId);
    if (filters.formId) filtered = filtered.filter(m => m.form_id === filters.formId);
    if (filters.status) filtered = filtered.filter(m => m.status === filters.status);
    if (filters.channel) filtered = filtered.filter(m => m.channel === filters.channel);

    const scored = filtered.filter(m => m.score !== undefined && m.score !== null);
    const gAvg = scored.length > 0 ? scored.reduce((acc, m) => acc + (m.score || 0), 0) / scored.length : 0;

    setMonitorias(filtered);
    setGlobalAvg(gAvg);
  }, [detailMonitorias, filters]);

  useEffect(() => {
    const handleReconnect = () => {
      console.log('[Dashboard] Reconexão detectada. Recarregando monitorias...');
      loadDataRef.current();
    };
    window.addEventListener('qualitrack:reconnected', handleReconnect);
    return () => {
      window.removeEventListener('qualitrack:reconnected', handleReconnect);
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase!;
    if (!user) return;

    let mounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channelName = `monitorias-realtime-dash-${Math.random().toString(36).substring(2, 11)}`;
    const channel = sb
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitorias' }, () => {
        if (!mounted) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadDataRef.current();
        }, 300);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'helpdesk_submissions' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadDataRef.current(), 300);
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

  useBackgroundRefresh(loadData, Boolean(user));

  useEffect(() => {
    if (!loading && successfulLoad.current) {
      cache.write({ filters, monitorias, allMonitorias, detailMonitorias, helpdeskSubmissions, globalAvg });
    }
  }, [cache, filters, monitorias, allMonitorias, detailMonitorias, helpdeskSubmissions, globalAvg, loading]);

  // SLA Notification Hook pós-login
  const { config: qualityConfig } = useQualityConfig();

  useEffect(() => {
    if (loading || !user || !deadlineReady) return;

    // Check if we have already notified in this login session
    const notifiedKey = `qualitrack_sla_notified_${user.id}`;
    if (sessionStorage.getItem(notifiedKey)) return;

    // Calculate critical SLA monitorias (< 1 hour remaining)
    const myTeamIds = user.team_ids || [];
    const now = new Date();

    const alertRows = [...new Map([...allMonitorias, ...deadlineMonitorias].map(m => [m.id, m])).values()];
    const pendingMonitorias = alertRows.filter(m => {
      if (!m.action_deadline_at) return false;

      // Filter by role scope
      let isScope = false;
      const status = m.status || '';

      if (user.role === 'suporte') {
        isScope = m.evaluated_id === user.id && ['pendente_revisao', 'contestacao_negada'].includes(status);
      } else if (user.role === 'qualidade') {
        isScope = m.evaluator_id === user.id && ['em_contestacao'].includes(status);
      } else if (user.role === 'gestor_suporte') {
        isScope = !!(m.team_id && myTeamIds.includes(m.team_id) && ['pendente_revisao', 'contestacao_negada', 'aguardando_gestor_suporte'].includes(status));
      } else if (user.role === 'gestor_qualidade') {
        isScope = ['em_contestacao', 'aguardando_gestor_qualidade'].includes(status);
      } else if (user.role === 'admin') {
        isScope = ['pendente_revisao', 'contestacao_negada', 'em_contestacao', 'aguardando_gestor_suporte', 'aguardando_gestor_qualidade'].includes(status);
      }

      if (!isScope) return false;

      // Calculate remaining business seconds
      const deadline = new Date(m.action_deadline_at);
      const remainingSeconds = getRemainingBusinessSeconds(now, deadline, qualityConfig?.businessHours);

      // SLA critical if less than 1 hour (3600 seconds) and greater than 0
      return remainingSeconds > 0 && remainingSeconds <= 3600;
    });

    if (pendingMonitorias.length > 0) {
      toast.warning(
        `Atenção: Você possui ${pendingMonitorias.length} monitoria(s) com SLA crítico (menos de 1 hora restante) aguardando sua ação!`,
        { duration: 8000 }
      );
    }

    // Set flag in sessionStorage to run once per login session
    sessionStorage.setItem(notifiedKey, 'true');
  }, [loading, user, allMonitorias, deadlineMonitorias, deadlineReady, qualityConfig]);

  // CORRECTION 8: Cooldown timer for manual refresh button
  useEffect(() => {
    if (!refreshCooldownEnd) return;
    const interval = setInterval(() => {
      const remaining = refreshCooldownEnd - Date.now();
      if (remaining <= 0) {
        setRefreshCooldownEnd(null);
        setRefreshCooldownRemaining('');
        clearInterval(interval);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setRefreshCooldownRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [refreshCooldownEnd]);

  const refresh = useCallback(() => {
    if (refreshCooldownEnd && Date.now() < refreshCooldownEnd) return; // block during cooldown
    setRefreshCooldownEnd(Date.now() + 5 * 60 * 1000); // 5 minute cooldown
    setRefreshTrigger(prev => prev + 1);
  }, [refreshCooldownEnd]);

  const stateValue = useMemo<DashboardState>(() => ({
    user,
    loggedInUser,
    dashboardRole,
    isSimulated,
    filters,
    monitorias,
    allMonitorias,
    qualityManagerQueue,
    helpdeskSubmissions,
    users: staticData.users,
    teams: staticData.teams,
    forms: staticData.forms,
    loading,
    refreshing,
    globalAvg,
    aggregates,
    dissatisfactionFields: staticData.dissatisfactionFields,
    refreshCooldownEnd,
    refreshCooldownRemaining,
  }), [
    user,
    loggedInUser,
    dashboardRole,
    isSimulated,
    filters,
    monitorias,
    allMonitorias,
    qualityManagerQueue,
    helpdeskSubmissions,
    staticData.users,
    staticData.teams,
    staticData.forms,
    loading,
    refreshing,
    globalAvg,
    aggregates,
    staticData.dissatisfactionFields,
    refreshCooldownEnd,
    refreshCooldownRemaining,
  ]);

  const dispatchValue = useMemo<DashboardDispatch>(() => ({
    setFilters,
    refresh,
  }), [refresh]);

  const editingValue = useMemo<EditingContextType>(() => ({
    activeEditingId,
    setActiveEditingId,
  }), [activeEditingId]);

  return (
    <DashboardStateContext value={stateValue}>
      <DashboardDispatchContext value={dispatchValue}>
        <EditingContext value={editingValue}>{children}</EditingContext>
      </DashboardDispatchContext>
    </DashboardStateContext>
  );
}

export function useDashboard() {
  const state = useDashboardState();
  const dispatch = useDashboardDispatch();
  const editing = useEditing();
  return {
    ...state,
    ...dispatch,
    activeEditingId: editing.activeEditingId,
    setActiveEditingId: editing.setActiveEditingId,
  };
}
