import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { List } from 'react-window';
import { Monitoria, Team, User } from '../types';
import { useStaticData } from '../lib/StaticDataContext';
import { useAuth } from '../providers/AuthProvider';
import { getStatusConfig, VARIANT_TEXT_CLASS, VARIANT_ICON_CONTAINER } from '../lib/statusHelper';
import {
  Search,
  ChevronDown,
  AlertTriangle,
  X,
  Paperclip,
  Loader2,
  FileText,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadActionAttachment } from '../lib/monitoriaAttachments';
import { exportMonitoriasToCsv } from '../utils/exportCsv';
import { m, AnimatePresence } from 'motion/react';
import { matchesAnySearch } from '../utils/search';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';
import CustomSelect from './ui/CustomSelect';
import CustomDatepicker from './ui/CustomDatepicker';
import { useQualityConfig } from '../lib/useQualityConfig';
import { useMonitoriaData } from '../hooks/useMonitoriaData';
import { useMonitoriaFilters } from '../hooks/useMonitoriaFilters';
import { useMonitoriaActions } from '../hooks/useMonitoriaActions';
import MonitoriaForm from './MonitoriaForm';
import { MonitoriaRow } from './MonitoriaRow';
import MonitoriaDetails from './MonitoriaDetails';

type VirtualRowProps = {
  monitorias: Monitoria[];
  teams: Team[];
  getName: (id: string, isEvaluator?: boolean, snapshotName?: string) => string;
  getLevelForScore: (score: number) => { color: string };
  onOpen: (id: string) => void;
};

function VirtualMonitoriaRow({ index, style, monitorias, teams, getName, getLevelForScore, onOpen }: VirtualRowProps & { index: number; style: React.CSSProperties; ariaAttributes?: unknown }) {
  const m = monitorias[index];
  if (!m) return null;
  return <MonitoriaRow monitoria={m} style={style} teams={teams} getName={getName} getLevelForScore={getLevelForScore} onOpen={onOpen} />;
}

interface MonitoriaListProps {
  user: User | null;
  onNew: () => void;
  activeTab?: string;
  initialFocusTarget?: { monitoriaId?: string; ticketId?: string } | null;
  onClearFocusTarget?: () => void;
}

export default function MonitoriaList({
  user,
  onNew,
  activeTab,
  initialFocusTarget,
  onClearFocusTarget
}: MonitoriaListProps) {
  const { config: qualityConfig, getLevelForScore } = useQualityConfig();
  const staticData = useStaticData();

  const { monitorias, loading, load } = useMonitoriaData(user, activeTab);
  const filters = useMonitoriaFilters();
  const {
    actionModal, setActionModal,
    actionNote, setActionNote,
    actionAttachments, setActionAttachments,
    reopenStatus, setReopenStatus,
    submitting,
    handleAction,
  } = useMonitoriaActions(user, monitorias, qualityConfig, load);

  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [viewingMonitoria, setViewingMonitoria] = useState<Monitoria | null>(null);

  // Debounced search state
  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        filters.setSearch(searchInput);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [searchInput, filters]);

  // Encolhe a barra lateral ao abrir uma monitoria, para dar mais espaço ao
  // formulário, e restaura o estado anterior ao fechar — sem sobrescrever a
  // preferência do usuário se ele já tivesse recolhido manualmente.
  const { isSidebarOpen, setIsSidebarOpen } = useAuth();
  const sidebarWasOpenRef = useRef(isSidebarOpen);
  useEffect(() => {
    if (viewingMonitoria) {
      sidebarWasOpenRef.current = isSidebarOpen;
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(sidebarWasOpenRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingMonitoria]);

  const focusOnMonitoria = useCallback((targetId: string) => {
    filters.setTab('todas');
    filters.setStatusFilter('active');
    filters.setAuditorFilter('');
    filters.setSuporteFilter('');
    filters.setTeamFilter('');
    filters.setSearch('');
    filters.setStartDate('');
    filters.setEndDate('');

    setSelectedId(targetId);

    setTimeout(() => {
      const el = document.getElementById(`monitoria-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 200);
  }, [filters]);

  useEffect(() => {
    if (initialFocusTarget?.monitoriaId) {
      focusOnMonitoria(initialFocusTarget.monitoriaId);
      onClearFocusTarget?.();
    }
  }, [initialFocusTarget, focusOnMonitoria, onClearFocusTarget]);

  useEffect(() => {
    const handleFocus = (e: Event) => {
      const customEvent = e as CustomEvent<{ monitoriaId?: string; ticketId?: string }>;
      const targetId = customEvent.detail?.monitoriaId;
      if (!targetId) return;
      focusOnMonitoria(targetId);
    };

    window.addEventListener('qualitrack:focus_monitoria', handleFocus);
    return () => window.removeEventListener('qualitrack:focus_monitoria', handleFocus);
  }, [focusOnMonitoria]);

  const openDetails = (id: string) => {
    openerRef.current = document.activeElement as HTMLElement;
    setSelectedId(id);
  };

  const closeDetails = () => {
    setSelectedId(null);
    requestAnimationFrame(() => openerRef.current?.focus());
  };

  useEffect(() => {
    if (!selectedId && !actionModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (actionModal) setActionModal(null);
        else closeDetails();
      }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>(actionModal ? '[data-action-dialog]' : '[data-detail-dialog]');
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], select:not([disabled]), textarea:not([disabled]), input:not([disabled])')).filter(el => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [selectedId, actionModal, setActionModal]);

  useEffect(() => { if (selectedId && !actionModal) detailCloseRef.current?.focus(); }, [selectedId, actionModal]);

  useEffect(() => {
    if (actionModal) document.querySelector<HTMLElement>('[data-action-dialog] select, [data-action-dialog] textarea, [data-action-dialog] button')?.focus();
  }, [actionModal]);

  const getName = (id: string, isEvaluator?: boolean, snapshotName?: string) => {
    if (isEvaluator && (user?.role === 'suporte' || user?.role === 'gestor_suporte')) {
      return 'Equipe de Qualidade';
    }
    if (snapshotName) return snapshotName;
    return staticData.users.find(u => u.id === id)?.name || id;
  };

  const filtered = useMemo(() => {
    return monitorias.filter(m => {
      if (filters.statusFilter === 'active' && m.active === false) return false;
      if (filters.statusFilter === 'removed' && m.active !== false) return false;

      if (user?.role === 'suporte' && m.evaluated_id !== user.id) return false;

      if (user?.role === 'gestor_suporte') {
        if (user.team_ids?.length && m.team_id && !user.team_ids.includes(m.team_id)) return false;
        else if (!user.team_ids?.length) return false;
      }

      if (filters.tab !== 'todas') {
        if (filters.tab === 'pendente_revisao') {
          if (m.status !== 'pendente_revisao' && m.status !== 'contestacao_negada') return false;
        } else if (filters.tab === 'expiradas_prazo') {
          const isTimeout = m.status === 'concluida' && m.resolution_type === 'automatic';
          if (!isTimeout) return false;
        } else if (filters.tab === 'concluida') {
          const isTimeout = m.status === 'concluida' && m.resolution_type === 'automatic';
          if (isTimeout || m.status !== 'concluida') return false;
        } else {
          if (m.status !== filters.tab) return false;
        }
      }

      if (filters.teamFilter && m.team_id !== filters.teamFilter) return false;
      if (filters.suporteFilter && m.evaluated_id !== filters.suporteFilter) return false;
      if (filters.auditorFilter && m.evaluator_id !== filters.auditorFilter) return false;

      if (filters.search) {
        const teamName = m.team_name || staticData.teams.find(t => t.id === m.team_id)?.name || '';
        const evaluatedName = getName(m.evaluated_id, false, m.evaluated_name);
        const evaluatorName = getName(m.evaluator_id, true, m.evaluator_name);
        const searchable: string[] = [
          m.ticket_id,
          String(m.display_id || ''),
          teamName,
          evaluatedName,
          evaluatorName,
          m.evaluator_note || '',
        ];
        if (!matchesAnySearch(searchable, filters.search)) return false;
      }

      const targetDate = filters.dateType === 'analysis' ? (m.analysis_date || m.created_at) : m.ticket_date;
      if (filters.startDate && targetDate < filters.startDate) return false;
      if (filters.endDate && targetDate > filters.endDate + 'T23:59:59') return false;

      return true;
    }).sort((a, b) => {
      const aIsFinished = ['concluida', 'finalizada_alterada', 'contestacao_aceita'].includes(a.status);
      const bIsFinished = ['concluida', 'finalizada_alterada', 'contestacao_aceita'].includes(b.status);

      if (!aIsFinished && bIsFinished) return -1;
      if (aIsFinished && !bIsFinished) return 1;

      if (!aIsFinished && !bIsFinished) {
        if (a.action_deadline_at && b.action_deadline_at) {
          return new Date(a.action_deadline_at).getTime() - new Date(b.action_deadline_at).getTime();
        }
        if (a.action_deadline_at) return -1;
        if (b.action_deadline_at) return 1;
      }

      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [monitorias, user, filters.tab, filters.search, filters.statusFilter, filters.teamFilter, filters.suporteFilter, filters.auditorFilter, filters.dateType, filters.startDate, filters.endDate]);

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
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  className="w-full h-full bg-surface-card border border-surface-border rounded-lg pl-9 pr-3 text-[10px] font-bold text-brand-primary placeholder:text-brand-muted/60 focus:border-brand-accent transition-all outline-none shadow-sm"
                />
              </div>
            </div>

            {/* Grupo Datas (col-span-12 lg:col-span-4) */}
            <div className="col-span-12 lg:col-span-4 lg:col-start-1 lg:row-start-2 flex items-center gap-2 w-full">
              <CustomDatepicker
                value={filters.startDate}
                onChange={(val: string) => filters.setStartDate(val)}
                placeholder="Data inicial"
                size="sm"
              />
              <span className="text-brand-muted/30 font-black text-[9px] uppercase tracking-widest shrink-0">até</span>
              <CustomDatepicker
                value={filters.endDate}
                onChange={(val: string) => filters.setEndDate(val)}
                placeholder="Data final"
                size="sm"
              />
            </div>

            {/* Bloco de Apoio (Direita - col-span-12 lg:col-span-8) */}
            <div className="col-span-12 lg:col-span-8 lg:col-start-5 lg:row-start-1 lg:row-span-2 flex flex-wrap items-center gap-2 w-full self-end">
              {/* Dropdowns */}
              <CustomSelect
                value={filters.teamFilter}
                onChange={val => filters.setTeamFilter(val)}
                options={[{ value: '', label: 'Todas Equipes' }, ...activeTeams.map(t => ({ value: t.id, label: t.name }))]}
                size="sm"
              />

              {user?.role !== 'suporte' && (
                <CustomSelect
                  value={filters.suporteFilter}
                  onChange={val => filters.setSuporteFilter(val)}
                  options={[{ value: '', label: 'Agentes' }, ...activeSuportes.map(s => ({ value: s.id, label: s.name }))]}
                  size="sm"
                />
              )}

              {['admin', 'gestor_qualidade'].includes(user?.role || '') && (
                <CustomSelect
                  value={filters.auditorFilter}
                  onChange={val => filters.setAuditorFilter(val)}
                  options={[{ value: '', label: 'Monitores' }, ...activeAuditors.map(a => ({ value: a.id, label: a.name }))]}
                  size="sm"
                />
              )}

              {/* Acompanha quem ganhou o poder de excluir logo abaixo: sem
                  isto, gestor_qualidade removeria uma monitoria e nunca mais
                  conseguiria vê-la na lista para conferir. Não existe ação de
                  RESTAURAR um registro removido — nem para admin — isso é uma
                  lacuna anterior a esta mudança, fora do escopo pedido aqui. */}
              {(user?.role === 'admin' || user?.role === 'gestor_qualidade') && (
                <CustomSelect
                  value={filters.statusFilter}
                  onChange={val => filters.setStatusFilter(val as any)}
                  options={[
                    { value: 'active', label: 'Ativas' },
                    { value: 'removed', label: 'Removidas' }
                  ]}
                  size="sm"
                />
              )}

              {/* Botão Exportar CSV */}
              <Button
                size="sm"
                variant="outline"
                icon={<Download className="w-3.5 h-3.5" />}
                onClick={() => {
                  const success = exportMonitoriasToCsv(filtered, 'monitorias_qualitrack', staticData.users, staticData.teams);
                  if (success) toast.success(`${filtered.length} monitorias exportadas para CSV!`);
                  else toast.error('Nenhuma monitoria para exportar.');
                }}
                className="h-8 text-[10px] font-black uppercase tracking-wider text-brand-muted hover:text-brand-primary shrink-0"
                title="Exportar registros filtrados para CSV (compatível com Excel)"
              >
                Exportar CSV
              </Button>

              {/* Clear button — animated clean button pushed to the right */}
              <AnimatePresence>
                {filters.hasActiveFilters && (
                  <m.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 28, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden flex-shrink-0 flex items-center justify-center ml-auto"
                  >
                    <button
                      onClick={filters.clearFilters}
                      className="w-7 h-7 rounded-full bg-functional-error/10 text-functional-error hover:bg-functional-error hover:text-white transition-all flex items-center justify-center shadow-sm cursor-pointer"
                      title="Limpar Filtros"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Status Tabs (Unified inside) — Tamanho extra compacto para caber harmoniosamente na tela */}
          <div className="pt-2.5 border-t border-surface-border/50 flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
            {[
              { id: 'todas', label: 'Todas' },
              { id: 'pendente_revisao', label: 'Pendente Revisão' },
              { id: 'em_contestacao', label: 'Em Contestação' },
              { id: 'aguardando_gestor_suporte', label: 'Gestão Suporte' },
              { id: 'aguardando_gestor_qualidade', label: 'Gestão Qualidade' },
              { id: 'concluida', label: 'Concluídas' },
              { id: 'expiradas_prazo', label: 'Por SLA', fullTitle: 'Finalizadas por SLA (Decurso de Prazo)' },
            ].map(({ id: t, label: tabLabel, fullTitle }) => {
              const count = monitorias.filter(m => {
                const matchesActiveStatus = filters.statusFilter === 'active' ? m.active !== false : m.active === false;

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
                  onClick={() => filters.setTab(t as any)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                    filters.tab === t
                      ? 'bg-brand-primary text-brand-on-primary shadow-xs ring-1 ring-brand-primary font-black'
                      : 'bg-surface-subtle/80 text-brand-primary/80 hover:text-brand-primary hover:bg-surface-card hover:border-surface-border border border-surface-border/50'
                  }`}
                  title={fullTitle || tabLabel}
                >
                  <span className="whitespace-nowrap">{tabLabel}</span>
                  <span
                    className={`px-1 py-0.5 rounded-full text-[8.5px] font-mono font-bold flex-shrink-0 min-w-3.5 text-center leading-none ${
                      filters.tab === t
                        ? 'bg-black/20 text-brand-on-primary'
                        : 'bg-surface-card text-brand-muted border border-surface-border/60'
                    }`}
                  >
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
          {filtered.length > 0 ? (
            filtered.length > 50 ? (
              <List<VirtualRowProps>
                rowComponent={VirtualMonitoriaRow}
                rowCount={filtered.length}
                rowHeight={72}
                rowProps={{ monitorias: filtered, teams: staticData.teams, getName, getLevelForScore, onOpen: openDetails }}
                overscanCount={5}
                style={{ height: 600, width: '100%' }}
              />
            ) : filtered.map(m => (
              <MonitoriaRow key={m.id} monitoria={m} teams={staticData.teams} getName={getName} getLevelForScore={getLevelForScore} onOpen={openDetails} />
            ))
          ) : (
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

      {selectedId && !viewingMonitoria && createPortal(
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/25 dark:bg-black/40 p-0 sm:p-6 backdrop-blur-md" onMouseDown={event => { if (event.target === event.currentTarget) closeDetails(); }}>
          <section data-detail-dialog role="dialog" aria-modal="true" aria-labelledby="monitoria-detail-title" className="flex h-[92vh] sm:h-auto sm:max-h-[calc(100dvh-3rem)] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border-t sm:border border-surface-border bg-surface-card shadow-2xl">
            {(() => {
              const m = monitorias.find(item => item.id === selectedId);
              if (!m) return <div className="p-6 text-brand-primary">Monitoria não encontrada.</div>;
              const cfg = getStatusConfig(m.status);
              return <>
                <header className="flex items-start gap-3 border-b border-surface-border p-4 sm:items-center sm:p-6">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${VARIANT_ICON_CONTAINER[cfg.variant]}`}><cfg.icon className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h2 id="monitoria-detail-title" className="text-base font-black text-brand-primary">Monitoria #{m.display_id || m.id.slice(0, 4)} · Ticket {m.ticket_id || 'S/N'}</h2>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-brand-primary/80">
                      <span>Agente: {getName(m.evaluated_id, false, m.evaluated_name)}</span>
                      <span>Equipe: {m.team_name || staticData.teams.find(t => t.id === m.team_id)?.name || 'N/A'}</span>
                      <span>Auditor: {getName(m.evaluator_id, true, m.evaluator_name)}</span>
                    </p>
                  </div>
                  <Badge variant={cfg.variant} size="xs" className="hidden shrink-0 sm:inline-flex">{cfg.shortLabel}</Badge>
                  <button ref={detailCloseRef} type="button" onClick={closeDetails} aria-label="Fechar detalhes" className="shrink-0 rounded-xl p-2 text-brand-primary hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand-accent"><X className="size-5" /></button>
                </header>
                <div className="min-h-0 overflow-y-auto p-4 sm:p-6 pb-safe">
                  <MonitoriaDetails monitoria={m} user={user} users={staticData.users} onView={item => setViewingMonitoria(item)} onAction={modal => setActionModal(modal)} />
                </div>
              </>;
            })()}
          </section>
        </div>, document.body
      )}

      <AnimatePresence>
        {actionModal && createPortal(
          <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center overflow-y-auto bg-black/25 dark:bg-black/40 p-0 sm:p-6 backdrop-blur-md" onMouseDown={event => { if (event.target === event.currentTarget) setActionModal(null); }}>
            <m.div data-action-dialog role="dialog" aria-modal="true" aria-labelledby="monitoria-action-title" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="w-full max-w-md overflow-y-auto rounded-t-3xl sm:rounded-3xl max-h-[92dvh] sm:max-h-[calc(100dvh-3rem)]">
              <Card className="w-full shadow-2xl border-t sm:border border-surface-border bg-surface-card rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-brand-primary/5 flex items-center justify-center text-brand-primary">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 id="monitoria-action-title" className="text-lg font-black text-brand-primary uppercase tracking-tight">Confirmar Ação</h3>
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

                {(() => {
                  const isSupportManager = user?.role === 'gestor_suporte';
                  const isApproval = actionModal.type === 'aprovar' || actionModal.type === 'aceitar';
                  const isContestation = actionModal.type === 'contestar';

                  let noteLabel = 'Justificativa / Motivo';
                  let notePlaceholder = 'Descreva detalhadamente o motivo desta ação...';
                  let noteRequired = false;

                  if (isSupportManager && isApproval) {
                    noteLabel = 'Ação Corretiva';
                    notePlaceholder = 'Descreva detalhadamente a ação corretiva aplicada para esta monitoria (obrigatório)...';
                    noteRequired = true;
                  } else if (isSupportManager && isContestation) {
                    noteLabel = 'Justificativa da Contestação';
                    notePlaceholder = 'Descreva detalhadamente a justificativa para contestar a avaliação (obrigatório)...';
                    noteRequired = true;
                  }

                  const showNoteField = (
                    actionModal.type === 'aprovar' ||
                    actionModal.type === 'aceitar' ||
                    actionModal.type === 'reabrir' ||
                    actionModal.type === 'contestar' ||
                    actionModal.type === 'escalar' ||
                    actionModal.type === 'excluir' ||
                    actionModal.type === 'solicitar_reavaliacao' ||
                    actionModal.type === 'manter' ||
                    actionModal.type === 'recusar_agente'
                  );

                  return (
                    <>
                      {showNoteField && (
                        <div className="mb-4">
                          <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1 mb-2 flex items-center justify-between">
                            <span>{noteLabel}</span>
                            {noteRequired && <span className="text-[9px] text-danger font-semibold tracking-normal">Obrigatório</span>}
                          </label>
                          <textarea
                            className="w-full bg-surface-bg border border-surface-border rounded-lg p-4 text-sm font-medium focus:outline-none focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all min-h-[100px]"
                            placeholder={notePlaceholder}
                            value={actionNote}
                            onChange={e => setActionNote(e.target.value)}
                          />
                        </div>
                      )}

                      {/* Suporte a Anexos (WQ-22) */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">
                            Anexos (opcional)
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-highlight hover:underline cursor-pointer">
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>Adicionar anexo</span>
                            <input
                              type="file"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file || !actionModal) return;
                                setUploadingAttachment(true);
                                try {
                                  const att = await uploadActionAttachment(file, actionModal.id);
                                  setActionAttachments([...actionAttachments, att]);
                                  toast.success(`Anexo "${file.name}" adicionado!`);
                                } catch (err: any) {
                                  toast.error(err.message || 'Falha ao anexar arquivo.');
                                } finally {
                                  setUploadingAttachment(false);
                                  e.target.value = '';
                                }
                              }}
                              disabled={uploadingAttachment}
                              accept="image/*,application/pdf,text/plain,.docx,audio/*"
                            />
                          </label>
                        </div>

                        {uploadingAttachment && (
                          <div className="flex items-center gap-2 text-xs text-brand-muted py-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-highlight" />
                            <span>Enviando anexo...</span>
                          </div>
                        )}

                        {actionAttachments.length > 0 && (
                          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                            {actionAttachments.map((att, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-surface-subtle/60 border border-surface-border/50 text-xs">
                                <div className="flex items-center gap-2 truncate">
                                  <FileText className="w-3.5 h-3.5 text-brand-muted shrink-0" />
                                  <span className="font-medium text-brand-primary truncate">{att.name}</span>
                                  <span className="text-[10px] text-brand-muted shrink-0">({(att.size / 1024).toFixed(0)} KB)</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setActionAttachments(actionAttachments.filter((_, i) => i !== idx))}
                                  className="text-brand-muted hover:text-danger p-1 transition-colors"
                                  title="Remover anexo"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 h-11 font-black uppercase text-[10px] tracking-widest" onClick={() => setActionModal(null)}>Cancelar</Button>
                  <Button variant="primary" className="flex-1 h-11 font-black uppercase text-[10px] tracking-widest" onClick={async () => {
                    await handleAction();
                    closeDetails();
                  }} disabled={submitting}>
                    {submitting ? 'Processando...' : 'Confirmar Ação'}
                  </Button>
                </div>
              </Card>
            </m.div>
          </div>, document.body
        )}
      </AnimatePresence>

      {viewingMonitoria && (
        <MonitoriaForm
          user={user}
          initialData={viewingMonitoria}
          onCancel={() => setViewingMonitoria(null)}
          onSaved={() => { setViewingMonitoria(null); load(); }}
        />
      )}
    </div>
  );
}
