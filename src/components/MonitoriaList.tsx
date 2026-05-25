// QualiTrack UI Refinement Session - 2026-05-13
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { Monitoria, MonitoriaStatus, User, Team, EvaluationForm, MonitoriaHistoryEntry } from '../types';
import { resolveContestationResult } from '../lib/contestation';
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
import ActionDeadlineClock from './ui/ActionDeadlineClock';
import { useQualityConfig } from '../lib/useQualityConfig';

export default function MonitoriaList({ user, onNew, activeTab }: { user: User | null; onNew: () => void; activeTab?: string }) {
  const { config: qualityConfig, getLevelForScore } = useQualityConfig();
  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
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

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent && !hasLoadedOnce.current) setLoading(true);
    try {
      let fetchedMonitorias: any[] = [];
      let fetchedUsers: any[] = [];
      let fetchedTeams: any[] = [];
      let fetchedForms: any[] = [];

      if (!supabase) {
        const { data: d } = await mockDb.get('monitorias');
        const { data: u } = await mockDb.get('users');
        const { data: t } = await mockDb.get('teams');
        const { data: f } = await mockDb.get('forms');
        fetchedMonitorias = d || [];
        fetchedUsers = u || [];
        fetchedTeams = t || [];
        fetchedForms = f || [];
      } else {
        const executeWithRetry = async (retryCount = 0): Promise<any[]> => {
          try {
            console.log(`[Monitorias] Buscando dados (Tentativa ${retryCount + 1})...`);
            const controller = new AbortController();
            
            let monitoriasQuery = supabase.from('monitorias').select('*').order('created_at', { ascending: false });

            const myTeamIds = user.team_ids || [];

            if (user.role === 'suporte') {
              if (myTeamIds.length > 0) {
                monitoriasQuery = monitoriasQuery.or(`evaluated_id.eq.${user.id},team_id.in.(${myTeamIds.map(id => `"${id}"`).join(',')})`);
              } else {
                monitoriasQuery = monitoriasQuery.eq('evaluated_id', user.id);
              }
            } else if (user.role === 'gestor_suporte') {
              if (myTeamIds.length > 0) {
                monitoriasQuery = monitoriasQuery.in('team_id', myTeamIds);
              } else {
                monitoriasQuery = monitoriasQuery.eq('team_id', '00000000-0000-0000-0000-000000000000');
              }
            }

            const fetchPromise = Promise.all([
              monitoriasQuery.abortSignal(controller.signal),
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
            console.error(`[Monitorias] Erro na tentativa ${retryCount + 1}:`, err);
            if (retryCount < 4) { // Até 5 tentativas
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

        const [mRes, uRes, tRes, fRes] = await executeWithRetry();
        fetchedMonitorias = mRes.data || [];
        fetchedUsers = uRes.data || [];
        fetchedTeams = tRes.data || [];
        fetchedForms = fRes.data || [];
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
        
        // Re-load silently
        setTimeout(() => {
          load(true);
        }, 50);
        return;
      }

      setMonitorias(fetchedMonitorias.map((r: any) => ({ ...r, history: r.history || [], answers: r.answers || {} })));
      setUsers(fetchedUsers as User[]);
      setTeams(fetchedTeams || []);
      setForms(fetchedForms || []);
    } catch (e: any) { 
      console.error(e);
      if (e.message === 'timeout') {
        toast.error('O servidor não respondeu. Tente alternar entre os menus para recarregar.');
      }
    }
    finally { 
      setLoading(false); 
      hasLoadedOnce.current = true;
      toast.dismiss('mon-retry');
    }
  }, [user]);

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

  // Recarrega sempre que a aba de monitorias for focada/exibida
  useEffect(() => {
    if (activeTab === 'monitorias') {
      console.log('[Monitorias] Aba selecionada, recarregando...');
      load();
    }
  }, [activeTab, load]);

  // Listener de reconexão automática e recarga de monitorias
  useEffect(() => {
    const handleReconnect = () => {
      console.log('[Monitorias] 🔄 Reconexão detectada. Recarregando dados...');
      load();
    };
    const handleRefresh = () => {
      console.log('[Monitorias] 🔄 Notificação de nova monitoria recebida. Recarregando dados...');
      load(true);
    };
    window.addEventListener('qualitrack:reconnected', handleReconnect);
    window.addEventListener('qualitrack:refresh-monitorias', handleRefresh);
    return () => {
      window.removeEventListener('qualitrack:reconnected', handleReconnect);
      window.removeEventListener('qualitrack:refresh-monitorias', handleRefresh);
    };
  }, [load]);

  // Realtime Supabase updates
  useEffect(() => {
    if (!supabase) return;
    
    console.log('[Monitorias] 🔌 Conectando canal Realtime Postgres...');
    const channel = supabase
      .channel('monitorias-realtime-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitorias' }, (payload) => {
        console.log('[Monitorias] ⚡ Alteração Postgres recebida via Realtime:', payload);
        load(true);
      })
      .subscribe();

    return () => {
      console.log('[Monitorias] 🔌 Desconectando canal Realtime Postgres...');
      supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => { load(); }, [load]);

  const getName = (id: string, isEvaluator?: boolean, snapshotName?: string) => {
    if (isEvaluator && (user?.role === 'suporte' || user?.role === 'gestor_suporte')) {
      return 'Equipe de Qualidade';
    }
    if (snapshotName) return snapshotName;
    return users.find(u => u.id === id)?.name || id;
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
    // statusFilter ('active'/'removed') and tab selection don't trigger the "Clear" button visibility
    return search !== '' || teamFilter !== '' || suporteFilter !== '' || auditorFilter !== '' || !isDefaultDate;
  }, [search, teamFilter, suporteFilter, auditorFilter, startDate, endDate]);

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

  const getStatusConfig = (status: MonitoriaStatus | 'expiradas_prazo') => {
    switch (status) {
      case 'pendente_revisao': return { label: 'Revisão', variant: 'warning' as const, icon: Clock };
      case 'em_contestacao': return { label: 'Reanálise', variant: 'error' as const, icon: AlertTriangle };
      case 'aguardando_gestor_suporte': return { label: 'Gestão Sup.', variant: 'info' as const, icon: Shield };
      case 'aguardando_gestor_qualidade': return { label: 'Gestão Qual.', variant: 'info' as const, icon: Shield };
      case 'concluida': return { label: 'Concluída', variant: 'success' as const, icon: CheckCircle2 };
      case 'finalizada_alterada': return { label: 'Alterada', variant: 'success' as const, icon: CheckCircle2 };
      case 'contestacao_aceita': return { label: 'Aceita', variant: 'success' as const, icon: CheckCircle2 };
      case 'contestacao_negada': return { label: 'Negada', variant: 'error' as const, icon: XCircle };
      case 'reavaliacao_solicitada': return { label: 'Reavaliação', variant: 'error' as const, icon: AlertTriangle };
      case 'expiradas_prazo': return { label: 'Prazo Expirado', variant: 'error' as const, icon: Clock };
      default: return { label: status, variant: 'neutral' as const, icon: AlertCircle };
    }
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
      window.dispatchEvent(new CustomEvent('qualitrack:refresh-monitorias'));
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally { setSubmitting(false); }
  };

  const activeTeams = useMemo(() => {
    let filtered = teams.filter(t => t.active !== false);
  if (user?.role === 'gestor_suporte' && user.team_ids?.length) {
    filtered = filtered.filter(t => user.team_ids!.includes(t.id));
  }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, user]);

  const activeSuportes = useMemo(() => {
    let filtered = users.filter(u => u.role === 'suporte' && u.active !== false);
  if (user?.role === 'gestor_suporte' && user.team_ids?.length) {
    filtered = filtered.filter(u => u.team_ids?.some(tid => user.team_ids!.includes(tid)));
  }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [users, user]);

  const activeAuditors = useMemo(() => {
    const list = users.filter(u => ['qualidade', 'gestor_qualidade', 'admin'].includes(u.role) && u.active !== false);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

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
          <div className="flex flex-col space-y-4">
            {/* Row 1: Date and Dropdowns */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Search (Now First) */}
              <div className="flex-1 min-w-[240px] h-10">
                <div className="relative h-full">
                  <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
                  <input 
                    type="text"
                    placeholder="Buscar ticket ou monitoria..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full h-full bg-surface-subtle border border-surface-border rounded-2xl pl-11 pr-4 text-[11px] font-bold text-brand-primary placeholder:text-brand-muted/60 focus:border-brand-accent transition-all outline-none"
                  />
                </div>
              </div>

              {/* Date Filter */}
              <div className="flex-1 min-w-[280px]">
                <div className="flex items-center gap-2 bg-surface-subtle border border-surface-border rounded-2xl px-3 h-10 group hover:border-brand-accent transition-all relative">
                  <div className="flex items-center gap-2 text-brand-muted group-hover:text-brand-accent transition-colors relative flex-1">
                    <Calendar className="w-3.5 h-3.5 relative z-10 pointer-events-none" />
                    <input 
                      type="date" 
                      value={startDate} 
                      onChange={e => setStartDate(e.target.value)} 
                      className="bg-transparent border-none p-0 text-[11px] font-bold w-full focus:ring-0 cursor-pointer relative z-0" 
                    />
                  </div>
                  <span className="text-brand-muted/30 font-black text-[9px] uppercase tracking-widest mx-0.5">até</span>
                  <div className="flex items-center gap-2 text-brand-muted group-hover:text-brand-accent transition-colors relative flex-1">
                    <Calendar className="w-3.5 h-3.5 relative z-10 pointer-events-none" />
                    <input 
                      type="date" 
                      value={endDate} 
                      onChange={e => setEndDate(e.target.value)} 
                      className="bg-transparent border-none p-0 text-[11px] font-bold w-full focus:ring-0 cursor-pointer relative z-0" 
                    />
                  </div>
                </div>
              </div>

              {/* Dropdowns */}
              <div className="flex-1 min-w-[160px] h-10">
                <CustomSelect 
                  value={teamFilter}
                  onChange={val => setTeamFilter(val)}
                  options={[{ value: '', label: 'Todas Equipes' }, ...activeTeams.map(t => ({ value: t.id, label: t.name }))]}
                  className="w-full"
                />
              </div>

              {user?.role !== 'suporte' && (
                <div className="flex-1 min-w-[160px] h-10">
                  <CustomSelect 
                    value={suporteFilter}
                    onChange={val => setSuporteFilter(val)}
                    options={[{ value: '', label: 'Agentes' }, ...activeSuportes.map(s => ({ value: s.id, label: s.name }))]}
                    className="w-full"
                  />
                </div>
              )}

              {['admin', 'gestor_qualidade'].includes(user?.role || '') && (
                <div className="flex-1 min-w-[160px] h-10">
                  <CustomSelect 
                    value={auditorFilter}
                    onChange={val => setAuditorFilter(val)}
                    options={[{ value: '', label: 'Monitores' }, ...activeAuditors.map(a => ({ value: a.id, label: a.name }))]}
                    className="w-full"
                  />
                </div>
              )}

              {user?.role === 'admin' && (
                <div className="flex-1 min-w-[160px] h-10">
                  <CustomSelect 
                    value={statusFilter}
                    onChange={val => setStatusFilter(val as any)}
                    options={[
                      { value: 'active', label: 'Monitorias Ativas' },
                      { value: 'removed', label: 'Monitorias Removidas' }
                    ]}
                    className="w-full"
                  />
                </div>
              )}

              {hasActiveFilters && (
                <button 
                  onClick={clearFilters}
                  className="p-2.5 rounded-2xl bg-red-50 text-error hover:bg-error hover:text-white transition-all group flex-shrink-0 shadow-sm"
                  title="Limpar Filtros"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
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

              return (
                <button
                  key={t}
                  onClick={() => setTab(t as any)}
                  className={`flex-1 min-w-[130px] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-between gap-3 ${tab === t ? 'bg-brand-primary text-brand-on-primary shadow-lg' : 'bg-surface-subtle text-brand-primary hover:bg-surface-card border border-surface-border/50'}`}
                >
                  <span className="truncate">{t === 'todas' ? 'Tudo' : getStatusConfig(t as any).label}</span>
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] flex-shrink-0 ${tab === t ? 'bg-black/10 text-brand-on-primary' : 'bg-surface-card text-brand-primary shadow-sm'}`}>
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
                <div className="flex items-center justify-between gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : m.id)}>
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-11 h-11 rounded-[1.25rem] flex items-center justify-center flex-shrink-0 bg-surface-bg text-brand-muted shadow-sm`}>
                      <config.icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-4 mb-1">
                        <div className="flex items-center gap-2 w-44">
                          <span className="text-[10px] font-black text-brand-muted/70 uppercase tracking-widest">#{m.display_id || m.id.slice(0,4)}</span>
                          <span className="text-brand-muted/30">•</span>
                          <span className="font-mono text-xs font-black text-brand-primary tracking-tight">TICKET {m.ticket_id}</span>
                        </div>
                        <div className="w-48 flex justify-center">
            {(() => {
              const isDeadlineExpired = m.status === 'concluida' && m.resolution_type === 'automatic';
              return (
                <Badge variant={config.variant} size="xs" className="uppercase font-black tracking-widest px-2">
                  {isDeadlineExpired ? 'Concluída pelo Sistema' : config.label}
                </Badge>
              );
            })()}
                        </div>
                        <div className="w-36">
                          {m.active !== false && <ActionDeadlineClock actionDeadlineAt={m.action_deadline_at} status={m.status} />}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-bold text-brand-muted uppercase tracking-tight">
                <span className="flex items-center gap-1.5"><UserIcon className="w-3 h-3 text-brand-highlight" /> {getName(m.evaluated_id, false, m.evaluated_name)}</span>
                <span className="text-brand-muted/20">•</span>
                <span className="flex items-center gap-1.5"><Shield className="w-3 h-3 text-brand-highlight" /> {getName(m.evaluator_id, true, m.evaluator_name)}</span>
                <span className="text-brand-muted/20">•</span>
                <span className="flex items-center gap-1.5"><Tag className="w-3 h-3 text-brand-highlight" /> {m.team_name || teams.find(t => t.id === m.team_id)?.name || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className={`text-xl font-black ${scoreColor} tracking-tighter`}>{m.score !== undefined ? `${m.score}%` : '—'}</p>
                      <p className="text-[9px] font-black text-brand-muted uppercase tracking-widest opacity-60 mt-0.5">{format(new Date(m.created_at), 'dd MMM yyyy', { locale: ptBR })}</p>
                    </div>
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
                                            const actor = users.find(u => u.id === h.by_id);
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
                              icon={<Eye className="w-4 h-4" />}
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
                                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                                  className="w-[130px] h-10 font-black uppercase text-[10px] tracking-widest shadow-sm border border-brand-primary/10"
                                >
                                  Aprovar
                                </Button>
                                {m.status === 'pendente_revisao' && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setActionModal({ id: m.id, type: 'contestar' })} 
                                    icon={<AlertTriangle className="w-3.5 h-3.5" />}
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
                                    icon={<XCircle className="w-3.5 h-3.5" />}
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
                                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                                  className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                                >
                                  Aprovar
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => setActionModal({ id: m.id, type: 'escalar' })} 
                                  icon={<AlertTriangle className="w-3.5 h-3.5" />}
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
                                  icon={<Pencil className="w-4 h-4" />}
                                  className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm border border-brand-primary/10"
                                >
                                  Reavaliar
                                </Button>
                                {m.status === 'em_contestacao' && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setActionModal({ id: m.id, type: 'manter' })} 
                                    icon={<XCircle className="w-4 h-4" />}
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
                                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                                  className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                                >
                                  Aprovar
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => setActionModal({ id: m.id, type: 'solicitar_reavaliacao' })} 
                                  icon={<Pencil className="w-3.5 h-3.5" />}
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
                                  className="w-full md:w-auto"
                                  icon={<RotateCcw className="w-4 h-4" />}
                                >
                                  Reabrir
                                </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setActionModal({ id: m.id, type: 'excluir' })} 
                                className="text-error hover:bg-red-50 w-full md:w-auto"
                                icon={<Trash2 className="w-4 h-4" />}
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
                    <select 
                      value={reopenStatus}
                      onChange={e => setReopenStatus(e.target.value as any)}
                      className="w-full bg-surface-bg border border-surface-border rounded-xl p-3 text-sm font-medium focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/50 transition-all mb-4"
                    >
                      <option value="pendente_revisao">Pendente Revisão (Agente de Suporte)</option>
                      <option value="em_contestacao">Em Contestação (Monitor de Qualidade)</option>
                      <option value="aguardando_gestor_suporte">Gestão Suporte (Gestor de Suporte)</option>
                      <option value="aguardando_gestor_qualidade">Gestão Qualidade (Gestor de Qualidade)</option>
                    </select>
                  </div>
                )}

                {(actionModal.type === 'aprovar' || actionModal.type === 'reabrir' || actionModal.type === 'contestar' || actionModal.type === 'escalar' || actionModal.type === 'excluir' || actionModal.type === 'solicitar_reavaliacao' || actionModal.type === 'manter' || actionModal.type === 'recusar_agente') && (
                  <div className="mb-6">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1 mb-2 block">Justificativa / Motivo</label>
                    <textarea 
                      className="w-full bg-surface-bg border border-surface-border rounded-[24px] p-5 text-sm font-medium focus:outline-none focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all min-h-[120px]"
                      placeholder="Descreva detalhadamente o motivo desta ação..."
                      value={actionNote}
                      onChange={e => setActionNote(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 rounded-[20px]" onClick={() => setActionModal(null)}>Cancelar</Button>
                  <Button className="flex-1 rounded-[20px] bg-brand-primary" onClick={handleAction} disabled={submitting}>
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
