// QualiTrack UI Refinement Session - 2026-05-13
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { Monitoria, MonitoriaStatus, User, Team, EvaluationForm, MonitoriaHistoryEntry } from '../types';
import { useStaticData } from '../lib/StaticDataContext';
import { useTheme } from '../App';
import { resolveContestationResult } from '../lib/contestation';
import { getStatusConfig } from '../lib/statusHelper';
import { 
  Search, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  RotateCcw, 
  Trash2, 
  Undo2, 
  Pencil,
  Calendar,
  Filter,
  ArrowRight,
  Shield,
  Tag,
  User as UserIcon,
  AlertTriangle,
  X,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import MonitoriaForm from './MonitoriaForm';
import { addBusinessHours } from '../lib/businessHours';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';
import CustomSelect from './ui/CustomSelect'; 
import CustomDatepicker from './ui/CustomDatepicker';
import ActionDeadlineClock from './ui/ActionDeadlineClock';
import { useQualityConfig } from '../lib/useQualityConfig';

export default function MonitoriaList({ user, onNew, activeTab }: { user: User | null; onNew: () => void; activeTab?: string }) {
  const { resolvedTheme } = useTheme();
  const { config: qualityConfig, getLevelForScore } = useQualityConfig();
  const staticData = useStaticData();
  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MonitoriaStatus | 'todas' | 'expiradas_prazo'>('todas');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'removed'>('active');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [suporteFilter, setSuporteFilter] = useState<string>('');
  const [auditorFilter, setAuditorFilter] = useState<string>('');
  const [dateType, setDateType] = useState<'analysis' | 'ticket'>('analysis');
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ id: string; type: 'aceitar' | 'contestar' | 'manter' | 'aprovar' | 'escalar' | 'excluir' | 'reavaliar' | 'devolver' | 'editAdmin' | 'solicitar_reavaliacao' | 'recusar_agente' | 'reabrir' } | null>(null);
  const [viewingMonitoria, setViewingMonitoria] = useState<Monitoria | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [reopenStatus, setReopenStatus] = useState<MonitoriaStatus>('pendente_revisao');
  const [submitting, setSubmitting] = useState(false);

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

      if (!supabase) {
        const { data: d } = await mockDb.get('monitorias');
        fetchedMonitorias = d || [];
      } else {
        const executeWithRetry = async (retryCount = 0): Promise<any[]> => {
          try {
            console.log(`[Monitorias] Buscando monitorias (Tentativa ${retryCount + 1})...`);
            const controller = new AbortController();

            let monitoriasQuery = supabase.from('monitorias').select('*').order('created_at', { ascending: false });

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
              await supabase.auth.getSession();
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

      // Check for expired monitorias and auto-finalize them
      const expired = fetchedMonitorias.filter((m: any) =>
        m.active !== false &&
        !['concluida', 'finalizada_alterada'].includes(m.status) &&
        m.action_deadline_at &&
        new Date(m.action_deadline_at) < new Date()
      );

      if (expired.length > 0) {
        console.log(`[Prazo] Encontradas ${expired.length} monitorias expiradas. Finalizando...`);
        const nowStr = new Date().toISOString();
        for (const m of expired) {
          const isQualityTurn = ['em_contestacao', 'aguardando_gestor_qualidade', 'reavaliacao_solicitada'].includes(m.status);
          const newScore = isQualityTurn ? 100 : m.score;
          const note = isQualityTurn
            ? 'Monitoria aprovada automaticamente (nota 100%) por perda de prazo da Equipe de Qualidade.'
            : 'Monitoria aprovada automaticamente por perda de prazo da Equipe de Suporte.';

          const historyEntry: MonitoriaHistoryEntry = {
            action: 'Finalização Automática (Prazo)',
            by_id: 'system',
            by_name: 'Sistema Automático',
            at: nowStr,
            note
          };

          const update = {
            status: 'concluida',
            score: newScore,
            resolution_type: 'automatic',
            updated_at: nowStr,
            history: [...(m.history || []), historyEntry]
          };

          if (!supabase) {
            await mockDb.update('monitorias', m.id, update);
          } else {
            await supabase.from('monitorias').update(update).eq('id', m.id);
          }
        }

        setTimeout(() => { loadRef.current(true); }, 50);
        return;
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

  // Ref-bridge para load — callback estável para Realtime e reconexão
  const loadRef = useRef(load);
  loadRef.current = load;

  // Failsafe contra skeletons infinitos (comum em abas suspensas)
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

  // Carrega monitorias quando user está disponível (1x apenas)
  useEffect(() => {
    if (user) {
      load();
    }
  }, [user, load]);

  // Recarrega quando volta para a aba monitorias (só se já carregou antes)
  useEffect(() => {
    if (activeTab === 'monitorias' && user && hasLoadedOnce.current) {
      console.log('[Monitorias] Aba selecionada, recarregando...');
      load();
    }
  }, [activeTab, user, load]);

  // Listener de reconexão automática
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

  // Realtime Supabase updates — canal conecta 1x por user, callback via ref
  useEffect(() => {
    if (!supabase || !user) return;

    let mounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channelName = `monitorias-realtime-list-${Math.random().toString(36).substring(2, 11)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitorias' }, () => {
        if (!mounted) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadRef.current(true);
        }, 300);
      })
      .subscribe();

    return () => {
      mounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const getName = (id: string, isEvaluator?: boolean, snapshotName?: string) => {
    if (isEvaluator && (user?.role === 'suporte' || user?.role === 'gestor_suporte')) {
      return 'Equipe de Qualidade';
    }
    if (snapshotName) return snapshotName;
    return staticData.users.find(u => u.id === id)?.name || id;
  };

  const filtered = useMemo(() => {
    return monitorias.filter(m => {
      // Active/Removed
      if (statusFilter === 'active' && m.active === false) return false;
      if (statusFilter === 'removed' && m.active !== false) return false;

      // Role-based visibility
      if (user?.role === 'suporte' && m.evaluated_id !== user.id) return false;
      
      // Supervisor de Atendimento: Vê apenas monitorias das suas equipes
if (user?.role === 'gestor_suporte') {
    if (user.team_ids?.length && m.team_id && !user.team_ids.includes(m.team_id)) return false;
    else if (!user.team_ids?.length) return false;
  }
      
      // Monitor de Qualidade: Por padrão vê tudo para "gerir as monitorias" (removida trava restritiva)

      // Tab (navigation by status)
      if (tab !== 'todas') {
        if (tab === 'pendente_revisao') {
          if (m.status !== 'pendente_revisao' && m.status !== 'contestacao_negada') return false;
      } else if (tab === 'expiradas_prazo') {
        const isTimeout = m.status === 'concluida' && m.resolution_type === 'automatic';
        if (!isTimeout) return false;
      } else if (tab === 'concluida') {
        const isTimeout = m.status === 'concluida' && m.resolution_type === 'automatic';
        if (isTimeout || m.status !== 'concluida') return false;
        } else {
          if (m.status !== tab) return false;
        }
      }

      // Filters
      if (teamFilter && m.team_id !== teamFilter) return false;
      if (suporteFilter && m.evaluated_id !== suporteFilter) return false;
      if (auditorFilter && m.evaluator_id !== auditorFilter) return false;

      // Search - Ticket ID or Monitoria ID only
      if (search) {
        const s = search.toLowerCase();
        const ticketId = m.ticket_id.toLowerCase();
        const displayId = (m.display_id || '').toString();
        if (!ticketId.includes(s) && !displayId.includes(s)) return false;
      }

      // Dates
      const targetDate = dateType === 'analysis' ? (m.analysis_date || m.created_at) : m.ticket_date;
      if (startDate && targetDate < startDate) return false;
      if (endDate && targetDate > endDate + 'T23:59:59') return false;

      return true;
    }).sort((a, b) => {
      const aIsFinished = ['concluida', 'finalizada_alterada', 'contestacao_aceita'].includes(a.status);
      const bIsFinished = ['concluida', 'finalizada_alterada', 'contestacao_aceita'].includes(b.status);

      // 1. Active (not finished) monitorias with deadlines always come first
      if (!aIsFinished && bIsFinished) return -1;
      if (aIsFinished && !bIsFinished) return 1;

      // 2. If both are active (not finished)
    if (!aIsFinished && !bIsFinished) {
      if (a.action_deadline_at && b.action_deadline_at) {
        return new Date(a.action_deadline_at).getTime() - new Date(b.action_deadline_at).getTime();
      }
      if (a.action_deadline_at) return -1;
      if (b.action_deadline_at) return 1;
      }

      // 3. Fallback: both are finished or neither has a deadline.
      // Sort by created_at descending (newest first for completed/inactive)
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [monitorias, user, tab, search, statusFilter, teamFilter, auditorFilter, dateType, startDate, endDate]);

  const hasActiveFilters = useMemo(() => {
    const isDefaultDate = startDate === new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0] &&
      endDate === new Date().toISOString().split('T')[0];
    return search !== '' || teamFilter !== '' || suporteFilter !== '' || auditorFilter !== '' || !isDefaultDate || statusFilter !== 'active';
  }, [search, teamFilter, suporteFilter, auditorFilter, startDate, endDate, statusFilter]);

  const clearFilters = () => {
    setSearch('');
    setTeamFilter('');
    setSuporteFilter('');
    setAuditorFilter('');
    setStatusFilter('active');
    setStartDate(new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
    setTab('todas');
  };

  const handleAction = async () => {
    if (!actionModal || !user) return;
    setSubmitting(true);
    const { id, type } = actionModal;
    const monitoria = monitorias.find(m => m.id === id);
    if (!monitoria) return;

    const now = new Date().toISOString();
    const actionDescriptions: Record<string, string> = {
      'aceitar': 'Monitoria aceita pelo suporte',
      'contestar': 'Contestação realizada pelo suporte',
      'manter': 'Contestação negada pela Qualidade',
      'aprovar': 'Monitoria aprovada pelo Gestor',
      'escalar': 'Escalado para decisão da Qualidade',
      'excluir': 'Monitoria removida pelo Administrador',
      'reavaliar': 'Reavaliação aceita pelo Gestor Qual.',
      'solicitar_reavaliacao': 'Reavaliação solicitada pelo Gestor',
      'devolver': 'Devolvido para reanálise da Qualidade',
      'recusar_agente': 'Contestação mantida pelo Agente (enviado ao Gestor)',
      'reabrir': 'Monitoria reaberta pelo Administrador'
    };

    const historyEntry: MonitoriaHistoryEntry = { 
        action: actionDescriptions[type] || 'Ação realizada', 
        by_id: user.id, 
        by_name: user.name, 
        at: now, 
        note: actionNote || undefined 
    };

    let nextStatus: MonitoriaStatus = monitoria.status;
    if (type === 'aceitar' || type === 'aprovar') nextStatus = 'concluida';
    else if (type === 'contestar' || type === 'devolver') nextStatus = 'em_contestacao';
    else if (type === 'manter') nextStatus = 'contestacao_negada'; // Volta para o suporte
    else if (type === 'recusar_agente') nextStatus = 'aguardando_gestor_suporte';
    else if (type === 'escalar') nextStatus = 'aguardando_gestor_qualidade';
    else if (type === 'solicitar_reavaliacao') nextStatus = 'reavaliacao_solicitada';
    else if (type === 'reabrir') nextStatus = reopenStatus;

  const getDeadlineHours = (status: MonitoriaStatus) => {
    const actionDeadline = qualityConfig.action_deadline;
    switch (status) {
      case 'pendente_revisao':
      case 'contestacao_negada': return actionDeadline?.agent_review || 50;
      case 'em_contestacao':
      case 'reavaliacao_solicitada': return actionDeadline?.auditor_reevaluation || 25;
      case 'aguardando_gestor_suporte': return actionDeadline?.manager_support || 25;
      case 'aguardando_gestor_qualidade': return actionDeadline?.manager_quality || 25;
      default: return 25;
    }
  };

  const update: any = type === 'excluir'
    ? { active: false, history: [...(monitoria.history || []), historyEntry], updated_at: now }
    : {
      status: nextStatus,
      updated_at: now,
      history: [...(monitoria.history || []), historyEntry],
      ...(nextStatus !== 'concluida' ? { action_deadline_at: addBusinessHours(new Date(), getDeadlineHours(nextStatus), qualityConfig.businessHours).toISOString() } : {}),
      ...(nextStatus === 'concluida' ? { resolution_type: 'human' } : {}),
      ...(type === 'contestar' || type === 'solicitar_reavaliacao' ? { contestation_reason: actionNote } : {}),
      ...(resolveContestationResult(actionDescriptions[type] || '') ? { contestation_result: resolveContestationResult(actionDescriptions[type] || '') } : {}),
    };

    try {
      if (!supabase) {
        await mockDb.update('monitorias', id, update);
      } else {
        const { error } = await supabase.from('monitorias').update(update).eq('id', id);
        if (error) throw error;
      }
      toast.success('Ação registrada com sucesso!');
      setActionModal(null);
      setActionNote('');
      load();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally { setSubmitting(false); }
  };

  const activeTeams = useMemo(() => {
    let filtered = staticData.teams.filter(t => t.active !== false);
    if (user?.role === 'gestor_suporte' && user.team_ids?.length) {
      filtered = filtered.filter(t => user.team_ids!.includes(t.id));
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [staticData.teams, user]);

  const activeSuportes = useMemo(() => {
    let filtered = staticData.users.filter(u => u.role === 'suporte' && u.active !== false);
    if (user?.role === 'gestor_suporte' && user.team_ids?.length) {
      filtered = filtered.filter(u => u.team_ids?.some(tid => user.team_ids!.includes(tid)));
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [staticData.users, user]);

  const activeAuditors = useMemo(() => {
    const list = staticData.users.filter(u => ['qualidade', 'gestor_qualidade', 'admin'].includes(u.role) && u.active !== false);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [staticData.users]);

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-card border border-surface-border animate-pulse" />)}
    </div>
  );

  if (viewingMonitoria) {
    return (
      <MonitoriaForm 
        user={user} 
        initialData={viewingMonitoria} 
        onCancel={() => setViewingMonitoria(null)} 
        onSaved={() => { setViewingMonitoria(null); load(); }} 
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Block 1: Filters & Status Joined */}
    <Card padding="none" className="border border-surface-border shadow-premium bg-surface-card rounded-3xl">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 w-full">
          {/* Busca (col-span-12 lg:col-span-4) */}
          <div className="col-span-12 lg:col-span-4 lg:col-start-1 lg:row-start-1">
            <div className="relative h-9">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
              <input
                type="text"
                placeholder="Buscar ticket..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full h-full bg-surface-card border border-surface-border rounded-lg pl-9 pr-3 text-[10px] font-bold text-brand-primary placeholder:text-brand-muted/60 focus:border-brand-accent transition-all outline-none shadow-sm"
              />
            </div>
          </div>

          {/* Grupo Datas (col-span-12 lg:col-span-4) */}
          <div className="col-span-12 lg:col-span-4 lg:col-start-1 lg:row-start-2 flex items-center gap-2 w-full">
            <CustomDatepicker
              value={startDate}
              onChange={(val: string) => setStartDate(val)}
              placeholder="Data inicial"
              size="sm"
            />
            <span className="text-brand-muted/30 font-black text-[9px] uppercase tracking-widest shrink-0">até</span>
            <CustomDatepicker
              value={endDate}
              onChange={(val: string) => setEndDate(val)}
              placeholder="Data final"
              size="sm"
            />
          </div>

          {/* Bloco de Apoio (Direita - col-span-12 lg:col-span-8) */}
          <div className="col-span-12 lg:col-span-8 lg:col-start-5 lg:row-start-1 lg:row-span-2 flex flex-wrap items-center gap-2 w-full self-end">
            {/* Dropdowns */}
            <CustomSelect
              value={teamFilter}
              onChange={val => setTeamFilter(val)}
              options={[{ value: '', label: 'Todas Equipes' }, ...activeTeams.map(t => ({ value: t.id, label: t.name }))]}
              size="sm"
            />

            {user?.role !== 'suporte' && (
              <CustomSelect
                value={suporteFilter}
                onChange={val => setSuporteFilter(val)}
                options={[{ value: '', label: 'Agentes' }, ...activeSuportes.map(s => ({ value: s.id, label: s.name }))]}
                size="sm"
              />
            )}

            {['admin', 'gestor_qualidade'].includes(user?.role || '') && (
              <CustomSelect
                value={auditorFilter}
                onChange={val => setAuditorFilter(val)}
                options={[{ value: '', label: 'Monitores' }, ...activeAuditors.map(a => ({ value: a.id, label: a.name }))]}
                size="sm"
              />
            )}

            {user?.role === 'admin' && (
              <CustomSelect
                value={statusFilter}
                onChange={val => setStatusFilter(val as any)}
                options={[
                  { value: 'active', label: 'Ativas' },
                  { value: 'removed', label: 'Removidas' }
                ]}
                size="sm"
              />
            )}

            {/* Clear button — animated clean button pushed to the right */}
            <AnimatePresence>
              {hasActiveFilters && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 28, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden flex-shrink-0 flex items-center justify-center ml-auto"
                >
                  <button
                    onClick={clearFilters}
                    className="w-7 h-7 rounded-full bg-functional-error/10 text-functional-error hover:bg-functional-error hover:text-white transition-all flex items-center justify-center shadow-sm cursor-pointer"
                    title="Limpar Filtros"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

          {/* Status Tabs (Unified inside) */}
        <div className="pt-4 border-t border-surface-border/50 flex flex-wrap gap-2">
          {['todas', 'pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte', 'aguardando_gestor_qualidade', 'concluida', 'expiradas_prazo'].map(t => {
          const count = monitorias.filter(m => {
            const matchesActiveStatus = statusFilter === 'active' ? m.active !== false : m.active === false;

            let matchesTab = false;
            if (t === 'todas') {
              matchesTab = true;
            } else if (t === 'pendente_revisao') {
              matchesTab = m.status === 'pendente_revisao' || m.status === 'contestacao_negada';
            } else if (t === 'expiradas_prazo') {
              matchesTab = m.status === 'concluida' && m.resolution_type === 'automatic';
            } else if (t === 'concluida') {
              const isTimeout = m.status === 'concluida' && m.resolution_type === 'automatic';
              matchesTab = m.status === 'concluida' && !isTimeout;
            } else {
              matchesTab = m.status === t;
            }

            return matchesActiveStatus && matchesTab;
          }).length;

          const tabLabel = t === 'todas' ? 'Tudo' : t === 'expiradas_prazo' ? 'Concluída Sist.' : getStatusConfig(t as any).shortLabel;

          return (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`flex-1 min-w-[110px] px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-between gap-2 ${tab === t ? 'bg-brand-primary text-brand-on-primary shadow-lg' : 'bg-surface-subtle text-brand-primary hover:bg-surface-card border border-surface-border/50'}`}
            >
              <span className="truncate">{tabLabel}</span>
              <span className={`px-1.5 py-0.5 rounded-lg text-[8px] flex-shrink-0 ${tab === t ? 'bg-black/10 text-brand-on-primary' : 'bg-surface-card text-brand-primary shadow-sm'}`}>
                {count}
              </span>
            </button>
          );
        })}
          </div>
        </div>
      </Card>

      {/* Block 2: The List */}
      <Card padding="none" className="border border-surface-border shadow-premium bg-surface-card overflow-hidden">
        <div className="divide-y divide-surface-subtle">
        {filtered.length > 0 ? filtered.map(m => {
          const config = getStatusConfig(m.status);
          const isExpanded = expandedId === m.id;
          const level = getLevelForScore(m.score || 0);
          const scoreColor = m.score !== undefined ? level.color : 'text-brand-muted';

          return (
            <div key={m.id} className={`p-4 hover:bg-surface-bg/30 transition-all ${isExpanded ? 'bg-surface-bg/20' : ''}`}>
              <div className="flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : m.id)}>
                {/* Left: Status Icon */}
                <div className={`w-11 h-11 rounded-[1.25rem] flex items-center justify-center flex-shrink-0 bg-surface-bg text-brand-muted shadow-sm`}>
                  <config.icon className="w-5 h-5" />
                </div>

                {/* Center: Info Block with fixed widths */}
                <div className="flex-1 min-w-0 flex items-center gap-4">
                  {/* ID + Ticket + Names */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-black text-brand-muted/70 uppercase tracking-widest">#{m.display_id || m.id.slice(0,4)}</span>
                      <span className="text-brand-muted/30">•</span>
                      <span className="font-mono text-xs font-black text-brand-primary tracking-tight">{m.ticket_id}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-brand-muted uppercase tracking-tight flex-wrap">
                      <span className="flex items-center gap-1"><UserIcon className="w-3 h-3 text-brand-highlight" />{getName(m.evaluated_id, false, m.evaluated_name)}</span>
                      <span className="text-brand-muted/20">•</span>
                      <span className="flex items-center gap-1"><Tag className="w-3 h-3 text-brand-highlight" />{m.team_name || staticData.teams.find(t => t.id === m.team_id)?.name || 'N/A'}</span>
                      <span className="text-brand-muted/20">•</span>
                      <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-brand-highlight" />{getName(m.evaluator_id, true, m.evaluator_name)}</span>
                    </div>
                  </div>
                </div>

                {/* 3-column fixed layout: Deadline | Status | Score */}
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {/* Col 1: Deadline — center, fixed width */}
                    <div className="min-w-[140px] flex justify-center">
                      {m.active !== false && <ActionDeadlineClock actionDeadlineAt={m.action_deadline_at} status={m.status} />}
                    </div>

                    {/* Col 2: Status badge — center, fixed width */}
                    <div className="min-w-[120px] flex justify-center">
                      {(() => {
                        const isDeadlineExpired = m.status === 'concluida' && m.resolution_type === 'automatic';
                        return (
                          <Badge variant={config.variant} size="xs" className="uppercase font-black tracking-widest px-2">
                            {isDeadlineExpired ? 'Concluída Sist.' : config.shortLabel}
                          </Badge>
                        );
                      })()}
                    </div>

                    {/* Col 3: Score + Date — right-aligned, fixed width */}
                    <div className="min-w-[70px] text-right">
                      <p className={`text-xl font-black ${scoreColor} tracking-tighter`}>{m.score !== undefined ? `${m.score}%` : '—'}</p>
                      <p className="text-[9px] font-black text-brand-muted uppercase tracking-widest opacity-60 mt-0.5">{format(new Date(m.created_at), 'dd MMM yyyy', { locale: ptBR })}</p>
                    </div>

                    {/* Expand Chevron */}
                    <div className={`p-2 rounded-xl transition-colors ${isExpanded ? 'bg-brand-primary/5 text-brand-primary' : 'text-brand-highlight'}`}>
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
              </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-4 pt-4 border-t border-surface-border/50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-2">
                        {/* Coluna 1: Observações, Linha do tempo e Visualizar Avaliação */}
                        <div className="space-y-6 flex flex-col justify-between h-full">
                          <div className="space-y-6">
                            <div>
                              <p className="text-[9px] font-black uppercase text-brand-muted/60 tracking-[0.2em] mb-2 ml-1">Observações da Qualidade</p>
                              <p className="text-sm text-brand-primary font-medium bg-surface-bg/50 p-4 rounded-3xl border border-surface-border/40 min-h-[80px] leading-relaxed italic">
                                "{m.evaluator_note || 'Nenhuma observação registrada.'}"
                              </p>
                            </div>
                            
                            {m.history?.length > 0 && (
                              <div>
                                <p className="text-[9px] font-black uppercase text-brand-muted/60 tracking-[0.2em] mb-3 ml-1 flex items-center gap-2">
                                  <History className="w-3 h-3" /> Linha do Tempo
                                </p>
                                <div className="space-y-4 ml-2 border-l-2 border-surface-border/60 pl-6 py-1">
                                  {m.history.map((h, i) => (
                                    <div key={i} className="relative">
                                      <div className="absolute -left-[31px] top-1.5 w-2 h-2 rounded-full bg-brand-accent border-2 border-surface-bg shadow-sm" />
                                      <div className="flex flex-col">
                                        <span className="text-[11px] font-bold text-brand-primary leading-none">{h.action}</span>
                                        <span className="text-[9px] font-bold text-brand-muted uppercase tracking-widest mt-1 opacity-70">
                                          {(() => {
                                            const actor = staticData.users.find(u => u.id === h.by_id);
                                            const isSupportView = user?.role === 'suporte' || user?.role === 'gestor_suporte';
                                            const isQualityActor = actor && ['qualidade', 'gestor_qualidade'].includes(actor.role);
                                            return (isSupportView && isQualityActor) ? 'Equipe de Qualidade' : h.by_name;
                                          })()} <span className="mx-1">•</span> {format(new Date(h.at), 'HH:mm')}
                                        </span>
                                        {h.note && (
                                          <div className="mt-2 text-[11px] text-brand-muted/80 bg-surface-subtle/50 p-2 rounded-xl border border-surface-border/30">
                                            {h.note}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="pt-4 mt-auto">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => setViewingMonitoria(m)} 
                              icon={<Eye className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
                              className="w-full md:w-auto shadow-sm border border-surface-border/50"
                            >
                              Visualizar Avaliação Completa
                            </Button>
                          </div>
                        </div>

                        {/* Coluna 2: Ações do Fluxo e Exclusão */}
                        <div className="flex flex-col justify-between h-full min-h-[220px] items-end space-y-6">
                          <div className="flex flex-wrap gap-3 justify-end items-start w-full">
                            {/* Suporte Actions */}
                            {user?.role === 'suporte' && (m.status === 'pendente_revisao' || m.status === 'contestacao_negada') && (
                              <div className="flex gap-3 items-center flex-wrap justify-end">
                                <Button 
                                  variant="secondary" 
                                  size="sm" 
                                  onClick={() => setActionModal({ id: m.id, type: 'aceitar' })} 
                                  icon={<CheckCircle2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                                  className="w-[130px] h-10 font-black uppercase text-[10px] tracking-widest shadow-sm border border-brand-primary/10"
                                >
                                  Aprovar
                                </Button>
                                {m.status === 'pendente_revisao' && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setActionModal({ id: m.id, type: 'contestar' })} 
                                    icon={<AlertTriangle className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                                    className="w-[130px] h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                                  >
                                    Contestar
                                  </Button>
                                )}
                                {m.status === 'contestacao_negada' && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setActionModal({ id: m.id, type: 'recusar_agente' })} 
                                    icon={<XCircle className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                                    className="w-[130px] h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                                  >
                                    Apelar
                                  </Button>
                                )}
                              </div>
                            )}

                            {/* Gestor Suporte Actions */}
                            {user?.role === 'gestor_suporte' && m.status === 'aguardando_gestor_suporte' && (
                              <div className="flex gap-3 items-center flex-wrap justify-end">
                                <Button 
                                  variant="secondary" 
                                  size="sm" 
                                  onClick={() => setActionModal({ id: m.id, type: 'aprovar' })} 
                                  icon={<CheckCircle2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                                  className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                                >
                                  Aprovar
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => setActionModal({ id: m.id, type: 'escalar' })} 
                                  icon={<AlertTriangle className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-y-0.5" />}
                                  className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                                >
                                  Escalar
                                </Button>
                              </div>
                            )}

                            {/* Qualidade / Auditor Actions */}
                            {(user?.role === 'qualidade' || user?.role === 'gestor_qualidade') && (m.status === 'em_contestacao' || m.status === 'reavaliacao_solicitada') && (
                              <div className="flex flex-wrap gap-3 justify-end items-start w-full">
                                <Button 
                                  variant="secondary" 
                                  size="sm" 
                                  onClick={() => setViewingMonitoria({ ...m, _reevaluate: true } as any)} 
                                  icon={<Pencil className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />}
                                  className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm border border-brand-primary/10"
                                >
                                  Reavaliar
                                </Button>
                                {m.status === 'em_contestacao' && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setActionModal({ id: m.id, type: 'manter' })} 
                                    icon={<XCircle className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
                                    className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                                  >
                                    Recusar
                                  </Button>
                                )}
                              </div>
                            )}

                            {/* Gestor Qualidade Final Actions */}
                            {user?.role === 'gestor_qualidade' && m.status === 'aguardando_gestor_qualidade' && (
                              <div className="flex gap-3 items-center flex-wrap justify-end">
                                <Button 
                                  variant="secondary" 
                                  size="sm" 
                                  onClick={() => setActionModal({ id: m.id, type: 'aprovar' })} 
                                  icon={<CheckCircle2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                                  className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                                >
                                  Aprovar
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => setActionModal({ id: m.id, type: 'solicitar_reavaliacao' })} 
                                  icon={<Pencil className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />}
                                  className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                                >
                                  Solicitar
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Admin Final / Excluir Registro no final da coluna 2 */}
                          {(user?.role === 'admin') && m.active !== false && (
                            <div className="w-full mt-auto flex justify-end gap-3 flex-wrap">
                              <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => setActionModal({ id: m.id, type: 'reabrir' })} 
                                  className="w-full md:w-auto font-black uppercase text-[10px] tracking-widest h-10"
                                  icon={<RotateCcw className="w-4 h-4 transition-transform duration-200 group-hover:rotate-[-45deg]" />}
                              >
                                Reabrir
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setActionModal({ id: m.id, type: 'excluir' })} 
                                className="text-functional-error hover:bg-functional-error/10 dark:hover:bg-functional-error/20 w-full md:w-auto font-black uppercase text-[10px] tracking-widest h-10"
                                icon={<Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
                              >
                                Excluir
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }) : (
            <div className="py-24 text-center bg-surface-bg/10">
              <div className="w-16 h-16 rounded-3xl bg-surface-subtle flex items-center justify-center mx-auto mb-4 opacity-50">
                <Search className="w-8 h-8 text-brand-muted" />
              </div>
              <p className="text-brand-muted font-black uppercase tracking-[0.2em] text-xs">Nenhuma monitoria encontrada</p>
              <p className="text-brand-muted/60 text-[10px] mt-2 font-bold uppercase">Ajuste os filtros ou o período de busca</p>
            </div>
          )}
        </div>
      </Card>

      <AnimatePresence>
        {actionModal && (
          <div className="fixed inset-0 bg-[#2D3A3A]/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <Card className="max-w-md w-full shadow-2xl border-none">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-brand-primary/5 flex items-center justify-center text-brand-primary">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-brand-primary uppercase tracking-tight">Confirmar Ação</h3>
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Protocolo #{monitorias.find(m => m.id === actionModal.id)?.display_id || '---'}</p>
                  </div>
                </div>

                <p className="text-sm text-brand-muted font-medium mb-6 leading-relaxed">
                  Você está prestes a realizar a ação de <strong className="text-brand-primary underline underline-offset-4">{
                    actionModal.type === 'aceitar' ? 'Aprovação/Aceite' : 
                    actionModal.type === 'recusar_agente' ? 'Apelo ao Gestor' :
                    actionModal.type === 'excluir' ? 'Exclusão' : 
                    actionModal.type === 'solicitar_reavaliacao' ? 'Solicitação de Reavaliação' :
                    actionModal.type === 'manter' ? 'Recusar Reavaliação' :
                    actionModal.type === 'escalar' ? 'Escalar para Qualidade' :
                    actionModal.type === 'reabrir' ? 'Reabertura de Monitoria' :
                    actionModal.type.toUpperCase()
                  }</strong> nesta monitoria.
                  <br /><br />
                  Esta operação ficará registrada no histórico e {
                    (actionModal.type === 'aceitar' || actionModal.type === 'aprovar') 
                    ? 'finalizará o processo deste ticket.' 
                    : 'dará continuidade ao fluxo de revisão.'
                  }
                </p>
                
                {actionModal.type === 'reabrir' && (
                  <div className="mb-6">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1 mb-2 block">Retornar para qual etapa?</label>
                    <div className="relative mb-4">
                      <select 
                        value={reopenStatus}
                        onChange={e => setReopenStatus(e.target.value as any)}
                        className="w-full appearance-none bg-surface-bg border border-surface-border rounded-lg p-3 pr-10 text-sm font-medium focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/50 transition-all"
                      >
                        <option value="pendente_revisao">Pendente Revisão (Agente de Suporte)</option>
                        <option value="em_contestacao">Em Contestação (Monitor de Qualidade)</option>
                        <option value="aguardando_gestor_suporte">Gestão Suporte (Gestor de Suporte)</option>
                        <option value="aguardando_gestor_qualidade">Gestão Qualidade (Gestor de Qualidade)</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-muted">
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                )}

                {(actionModal.type === 'aprovar' || actionModal.type === 'reabrir' || actionModal.type === 'contestar' || actionModal.type === 'escalar' || actionModal.type === 'excluir' || actionModal.type === 'solicitar_reavaliacao' || actionModal.type === 'manter' || actionModal.type === 'recusar_agente') && (
                  <div className="mb-6">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1 mb-2 block">Justificativa / Motivo</label>
                    <textarea 
                      className="w-full bg-surface-bg border border-surface-border rounded-lg p-5 text-sm font-medium focus:outline-none focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all min-h-[120px]"
                      placeholder="Descreva detalhadamente o motivo desta ação..."
                      value={actionNote}
                      onChange={e => setActionNote(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 h-11 font-black uppercase text-[10px] tracking-widest" onClick={() => setActionModal(null)}>Cancelar</Button>
                  <Button variant="primary" className="flex-1 h-11 font-black uppercase text-[10px] tracking-widest" onClick={handleAction} disabled={submitting}>
                    {submitting ? 'Processando...' : 'Confirmar Ação'}
                  </Button>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
