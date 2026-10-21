import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { List } from 'react-window';
import { Monitoria, Team, User } from '../types';
import { useStaticData } from '../lib/StaticDataContext';
import { getStatusConfig, VARIANT_TEXT_CLASS, VARIANT_ICON_CONTAINER } from '../lib/statusHelper';
import {
  Search,
  ChevronDown,
  AlertTriangle,
  X,
  Paperclip,
  Loader2,
  Download,
  MessageSquare,
  Award,
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  SlidersHorizontal,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadActionAttachment } from '../lib/monitoriaAttachments';
import { exportMonitoriasToCsv } from '../utils/exportCsv';
import { m, AnimatePresence } from 'motion/react';
import Card from './ui/Card';
import Badge from './ui/Badge';
import MonitoriaIdBadge from './ui/MonitoriaIdBadge';
import Button from './ui/Button';
import CustomSelect from './ui/CustomSelect';
import CustomDatepicker from './ui/CustomDatepicker';
import { useQualityConfig } from '../lib/useQualityConfig';
import { useMonitoriaData } from '../hooks/useMonitoriaData';
import { useMonitoriaFilters } from '../hooks/useMonitoriaFilters';
import type { MonitoriaSortField } from '../hooks/useMonitoriaFilters';
import { useMonitoriaActions, getPreviousStage, getNextStage, getStageLabel, getStagePendingAction, STAGES_FLOW } from '../hooks/useMonitoriaActions';
import { useFeedbacks } from '../hooks/useFeedbacks';
import FeedbacksSubtabView from './feedback/FeedbacksSubtabView';
import MonitoriaForm from './MonitoriaForm';
import { MonitoriaRow } from './MonitoriaRow';
import MonitoriaDetails from './MonitoriaDetails';
import HelpdeskSendModal from './HelpdeskSendModal';
import { publishEvaluationToHelpdesk } from '../lib/helpdesk';
import { isChildTicketMonitoria } from '../lib/childTicketForm';

type VirtualRowProps = {
  monitorias: Monitoria[];
  teams: Team[];
  getName: (id: string, isEvaluator?: boolean, snapshotName?: string) => string;
  getLevelForScore: (score: number) => { color: string };
  onOpen: (id: string) => void;
  displayMode: 'table' | 'card';
};

function VirtualMonitoriaRow({ index, style, monitorias, teams, getName, getLevelForScore, onOpen, displayMode }: VirtualRowProps & { index: number; style: React.CSSProperties; ariaAttributes?: unknown }) {
  const m = monitorias[index];
  if (!m) return null;
  return <MonitoriaRow monitoria={m} style={style} teams={teams} getName={getName} getLevelForScore={getLevelForScore} onOpen={onOpen} displayMode={displayMode} />;
}

interface MonitoriaListProps {
  user: User | null;
  activeTab?: string;
  initialFocusTarget?: { monitoriaId?: string; ticketId?: string } | null;
  onClearFocusTarget?: () => void;
  initialSubTab?: 'avaliacoes' | 'feedbacks' | 'one_on_one';
}

export default function MonitoriaList({
  user,
  activeTab,
  initialFocusTarget,
  onClearFocusTarget,
  initialSubTab = 'avaliacoes',
}: MonitoriaListProps) {
  const { config: qualityConfig, getLevelForScore } = useQualityConfig();
  const staticData = useStaticData();

  const maskedUsers = useMemo(() => {
    if (user?.role === 'suporte') {
      return staticData.users.map(u => {
        if (['qualidade', 'gestor_qualidade', 'admin'].includes(u.role)) {
          return { ...u, name: 'Análise da Qualidade', email: 'qualidade@sistema.local' };
        }
        return u;
      });
    }
    return staticData.users;
  }, [staticData.users, user?.role]);

  const [feedbackViewMode, setFeedbackViewMode] = useState<'feedback' | 'one_on_one'>(initialSubTab === 'one_on_one' ? 'one_on_one' : 'feedback');
  const isFeedbackPage = activeTab === 'feedbacks';
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const feedbacksState = useFeedbacks(user);

  const filters = useMonitoriaFilters();
  const sortByColumn = useCallback((field: MonitoriaSortField) => {
    if (filters.sortField === field) {
      filters.setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    filters.setSortField(field);
    filters.setSortDirection('asc');
  }, [filters.sortField, filters.setSortDirection, filters.setSortField]);
  const [page, setPage] = useState(0);
  const { monitorias, loading, total, load, fetchDetail, fetchExportRows } = useMonitoriaData(user, activeTab, {
    page,
    pageSize: 50,
    enabled: !isFeedbackPage,
    filters: {
      tab: filters.tab, search: filters.search,
      teamFilter: filters.teamFilter, suporteFilter: filters.suporteFilter,
      auditorFilter: filters.auditorFilter, ticketKindFilter: filters.ticketKindFilter,
      dateType: filters.dateType, startDate: filters.startDate, endDate: filters.endDate,
      sortField: filters.sortField, sortDirection: filters.sortDirection,
    },
  });
  useEffect(() => { setPage(0); }, [filters.tab, filters.search, filters.teamFilter, filters.suporteFilter, filters.auditorFilter, filters.ticketKindFilter, filters.dateType, filters.startDate, filters.endDate, filters.sortField, filters.sortDirection]);
  const [selectedDetail, setSelectedDetail] = useState<Monitoria | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const {
    actionModal, setActionModal,
    actionNote, setActionNote,
    actionAttachments, setActionAttachments,
    reopenStatus, setReopenStatus,
    targetStatus, setTargetStatus,
    submitting,
    handleAction,
  } = useMonitoriaActions(user, selectedDetail && !monitorias.some(item => item.id === selectedDetail.id)
    ? [...monitorias, selectedDetail] : monitorias, qualityConfig, load, staticData.teams);

  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [viewingMonitoria, setViewingMonitoria] = useState<Monitoria | null>(null);
  const [helpdeskMonitoria, setHelpdeskMonitoria] = useState<Monitoria | null>(null);

  useEffect(() => {
    if (!selectedId) { setSelectedDetail(null); setDetailLoading(false); return; }
    let cancelled = false;
    setSelectedDetail(null);
    setDetailLoading(true);
    fetchDetail(selectedId).then(detail => {
      if (!cancelled) setSelectedDetail(detail);
    }).catch(error => {
      console.error('[Monitorias] Falha ao abrir ficha:', error);
      if (!cancelled) toast.error('Não foi possível carregar a ficha da monitoria.');
    }).finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, fetchDetail]);

  // Keep the draft separate from the applied server filter until submission.
  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  const focusOnMonitoria = useCallback((targetId: string) => {
    filters.setTab('todas');
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

  const filtered = monitorias;

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
      filtered = filtered.filter(u => u.primary_team_id
        ? user.team_ids!.includes(u.primary_team_id)
        : u.team_ids?.some(tid => user.team_ids!.includes(tid)));
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [staticData.users, user]);

  const activeAuditors = useMemo(() => {
    const list = staticData.users.filter(u => ['qualidade', 'gestor_qualidade', 'admin'].includes(u.role) && u.active !== false);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [staticData.users]);

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Navegação Superior de Subabas de Monitorias: Avaliações | Feedbacks | 1:1 & PDI */}
      {isFeedbackPage && <div role="tablist" aria-label="Tipo de feedback" className="inline-flex max-w-full items-center gap-1 rounded-xl border border-surface-border bg-surface-card p-1 shadow-sm">
        {([{ id: 'feedback', label: 'Pontuais', icon: MessageSquare }, { id: 'one_on_one', label: 'Alinhamento Mensal', icon: Award }] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={feedbackViewMode === id} onClick={() => setFeedbackViewMode(id)} className={`relative rounded-lg px-3.5 py-2 text-[11px] font-bold transition-colors ${feedbackViewMode === id ? 'text-brand-primary' : 'text-brand-muted hover:text-brand-primary'}`}>
            {feedbackViewMode === id && <m.span layoutId="monitoria-feedback-tab" className="absolute inset-0 rounded-lg bg-surface-card shadow-sm" transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }} />}
            <span className="relative inline-flex items-center gap-2"><Icon className="size-3.5" />{label}</span>
          </button>
        ))}
      </div>}

      {isFeedbackPage && feedbackViewMode === 'feedback' && (
        <FeedbacksSubtabView
          currentUser={user}
          users={maskedUsers}
          teams={staticData.teams}
          monitorias={monitorias}
          feedbacks={feedbacksState.feedbacks}
          loading={feedbacksState.loading}
          refreshing={feedbacksState.refreshing}
          error={feedbacksState.error}
          onRefresh={feedbacksState.refreshFeedbacks}
          onCreateFeedback={feedbacksState.createFeedback}
          onAcknowledgeFeedback={feedbacksState.acknowledgeFeedback}
          onCompleteFeedback={feedbacksState.completeFeedback}
          mode="feedback"
        />
      )}

      {isFeedbackPage && feedbackViewMode === 'one_on_one' && (
        <FeedbacksSubtabView
          currentUser={user}
          users={maskedUsers}
          teams={staticData.teams}
          monitorias={monitorias}
          feedbacks={feedbacksState.feedbacks}
          loading={feedbacksState.loading}
          refreshing={feedbacksState.refreshing}
          error={feedbacksState.error}
          onRefresh={feedbacksState.refreshFeedbacks}
          onCreateFeedback={feedbacksState.createFeedback}
          onAcknowledgeFeedback={feedbacksState.acknowledgeFeedback}
          onCompleteFeedback={feedbacksState.completeFeedback}
          mode="one_on_one"
        />
      )}

      {!isFeedbackPage && (
        <>
          {/* Block 1: Filters & Status Joined */}
          <Card padding="none" className="border border-surface-border shadow-premium bg-surface-card rounded-3xl">
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <form
            className="flex flex-col gap-3 lg:flex-row lg:items-center"
            onSubmit={event => {
              event.preventDefault();
              filters.setSearch(searchInput.trim());
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar monitoria"
                placeholder="Buscar por monitoria, ticket, agente ou equipe"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-surface-border bg-surface-bg pl-10 pr-3 text-sm text-brand-primary placeholder:text-brand-muted/70 focus-visible:border-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/20"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" variant="primary" className="h-10 px-4">Pesquisar</Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10"
                aria-expanded={showAdvancedFilters}
                onClick={() => setShowAdvancedFilters(open => !open)}
              >
                <SlidersHorizontal className="mr-2 size-4" />
                Filtros
                {filters.hasActiveFilters && <span className="ml-2 rounded-full bg-brand-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-accent">Ativos</span>}
                <ChevronDown className={`ml-2 size-4 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<Download className="size-4" />}
                onClick={async () => {
                  try {
                    const rows = await fetchExportRows(filtered.map(row => row.id));
                    const success = exportMonitoriasToCsv(rows, 'monitorias_qualitrack', staticData.users, staticData.teams);
                    if (success) toast.success(`${rows.length} monitorias desta p?gina exportadas para CSV!`);
                    else toast.error('Nenhuma monitoria para exportar.');
                  } catch (error) {
                    console.error('[Monitorias] Falha ao exportar CSV:', error);
                    toast.error('N?o foi poss?vel exportar as monitorias.');
                  }
                }}
              >
                Exportar
              </Button>
              {filters.hasActiveFilters && <Button type="button" size="sm" variant="ghost" onClick={filters.clearFilters}>Limpar filtros</Button>}
            </div>
          </form>

          <AnimatePresence initial={false}>
            {showAdvancedFilters && <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="grid gap-3 border-t border-surface-border/70 pt-4 sm:grid-cols-2 xl:grid-cols-4">
                <CustomSelect
                  value={filters.teamFilter}
                  onChange={val => filters.setTeamFilter(val)}
                  options={[{ value: '', label: 'Todas as equipes' }, ...activeTeams.map(team => ({ value: team.id, label: team.name }))]}
                  size="sm"
                />
                {user?.role !== 'suporte' && <CustomSelect
                  value={filters.suporteFilter}
                  onChange={val => filters.setSuporteFilter(val)}
                  options={[{ value: '', label: 'Todos os agentes' }, ...activeSuportes.map(support => ({ value: support.id, label: support.name }))]}
                  size="sm"
                />}
                {['admin', 'gestor_qualidade'].includes(user?.role || '') && <CustomSelect
                  value={filters.auditorFilter}
                  onChange={val => filters.setAuditorFilter(val)}
                  options={[{ value: '', label: 'Todos os monitores' }, ...activeAuditors.map(auditor => ({ value: auditor.id, label: auditor.name }))]}
                  size="sm"
                />}
                <CustomSelect
                  value={filters.ticketKindFilter}
                  onChange={val => filters.setTicketKindFilter(val as 'all' | 'child' | 'service')}
                  options={[{ value: 'all', label: 'Todos os tipos' }, { value: 'child', label: 'Ticket filho' }, { value: 'service', label: 'Atendimento' }]}
                  size="sm"
                />
                <CustomSelect
                  value={filters.dateType}
                  onChange={val => filters.setDateType(val as 'analysis' | 'ticket')}
                  options={[{ value: 'analysis', label: 'Data da monitoria' }, { value: 'ticket', label: 'Data do ticket' }]}
                  size="sm"
                />
                <CustomDatepicker value={filters.startDate} onChange={(value: string) => filters.setStartDate(value)} placeholder="Data inicial" size="sm" />
                <CustomDatepicker value={filters.endDate} onChange={(value: string) => filters.setEndDate(value)} placeholder="Data final" size="sm" />
                <div className="flex gap-2">
                  <CustomSelect
                    value={filters.sortField}
                    onChange={value => filters.setSortField(value as MonitoriaSortField)}
                    options={[
                      { value: 'display_id', label: 'Ordenar: monitoria' },
                      { value: 'ticket_id', label: 'Ordenar: ticket' },
                      { value: 'evaluated_name', label: 'Ordenar: agente' },
                      { value: 'team_name', label: 'Ordenar: equipe' },
                      { value: 'evaluator_name', label: 'Ordenar: monitor' },
                      { value: 'form_id', label: 'Ordenar: tipo' },
                      { value: 'score', label: 'Ordenar: avalia??o' },
                      { value: 'status', label: 'Ordenar: status' },
                    ]}
                    aria-label="Ordenar monitorias por"
                    size="sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={filters.sortDirection === 'asc' ? 'Ordem crescente; mudar para decrescente' : 'Ordem decrescente; mudar para crescente'}
                    title={filters.sortDirection === 'asc' ? 'Ordem crescente' : 'Ordem decrescente'}
                    onClick={() => filters.setSortDirection(current => current === 'asc' ? 'desc' : 'asc')}
                  >
                    {filters.sortDirection === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                  </Button>
                </div>
              </div>
            </m.div>}
          </AnimatePresence>

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
              return (
                <button
                  key={t}
                  onClick={() => filters.setTab(t as any)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                    filters.tab === t
                      ? 'bg-brand-primary text-brand-on-primary shadow-xs ring-1 ring-brand-primary font-black'
                      : 'bg-surface-subtle/80 text-brand-primary/80 hover:text-brand-primary hover:bg-surface-card hover:border-surface-border border border-surface-border/50'
                  }`}
                  title={fullTitle || tabLabel}
                >
                  <span className="whitespace-nowrap">{tabLabel}</span>
                  {filters.tab === t && <span
                    className={`px-1.5 py-1 rounded-full text-[11px] font-mono font-bold flex-shrink-0 min-w-[22px] text-center leading-none tabular-nums ${
                      filters.tab === t
                        ? 'bg-black/20 text-brand-on-primary'
                        : 'bg-surface-card text-brand-muted border border-surface-border/60'
                    }`}
                  >
                    {total}
                  </span>}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Block 2: The List */}
      <Card padding="none" className="border border-surface-border shadow-premium bg-surface-card overflow-hidden">
        <div role="table" aria-label="Monitorias" className="overflow-x-auto">
            <div role="rowgroup" className="hidden min-w-[1120px] border-b border-surface-border bg-surface-subtle/45 lg:block">
              <div role="row" className="grid min-h-11 grid-cols-[142px_145px_112px_minmax(140px,1.1fr)_minmax(120px,0.9fr)_minmax(145px,1fr)_110px_125px_34px] items-center gap-2 px-4 text-[10px] font-bold uppercase tracking-wide text-brand-muted">
                {([
                  ['Status', 'status'], ['Monitoria', 'display_id'], ['Ticket', 'ticket_id'], ['Agente', 'evaluated_name'],
                  ['Equipe', 'team_name'], ['Monitor de qualidade', 'evaluator_name'], ['Tipo', 'form_id'], ['Avaliação', 'score'],
                ] as const).map(([label, field]) => (
                  <div key={field} role="columnheader" className="min-w-0">
                    <button type="button" onClick={() => sortByColumn(field)} className="inline-flex max-w-full items-center gap-1.5 rounded-md text-left hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent" aria-label={`Ordenar por ${label}, atualmente ${filters.sortField === field ? filters.sortDirection === 'asc' ? 'crescente' : 'decrescente' : 'sem ordenação'}`}>
                      <span className="truncate">{label}</span>
                      {filters.sortField === field ? filters.sortDirection === 'asc' ? <ArrowUp className="size-3.5 shrink-0" /> : <ArrowDown className="size-3.5 shrink-0" /> : <ArrowDown className="size-3.5 shrink-0 opacity-20" />}
                    </button>
                  </div>
                ))}
                <span role="columnheader" className="sr-only">Ações</span>
              </div>
            </div>
          <div role="rowgroup">
          {loading ? (
            <div role="status" className="flex min-h-32 items-center justify-center gap-2 text-sm text-brand-muted">
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
              Buscando monitorias...
            </div>
          ) : filtered.length > 0 ? (
            filtered.length > 50 ? (
              <List<VirtualRowProps>
                rowComponent={VirtualMonitoriaRow}
                rowCount={filtered.length}
                rowHeight={72}
                rowProps={{ monitorias: filtered, teams: staticData.teams, getName, getLevelForScore, onOpen: openDetails, displayMode: 'table' }}
                overscanCount={5}
                style={{ height: 600, width: 'max(100%, 1120px)' }}
              />
            ) : filtered.map(m => (
              <MonitoriaRow key={m.id} monitoria={m} teams={staticData.teams} getName={getName} getLevelForScore={getLevelForScore} onOpen={openDetails} displayMode="table" />
            ))
          ) : (
            <div className="py-20 px-4 text-center bg-surface-bg/10">
              <div className="w-14 h-14 rounded-3xl bg-surface-subtle flex items-center justify-center mx-auto mb-3 opacity-60">
                <Search className="w-6 h-6 text-brand-muted" />
              </div>
              <p className="text-brand-primary font-black uppercase tracking-wider text-xs">Nenhuma monitoria encontrada</p>
              <p className="text-brand-muted text-[11px] mt-1 font-semibold">
                Nenhum registro corresponde aos filtros selecionados{filters.tab !== 'todas' ? ` nesta aba ("${filters.tab.replace('_', ' ')}")` : ''}.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {(filters.startDate || filters.endDate) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      filters.setStartDate('');
                      filters.setEndDate('');
                    }}
                    className="text-[10px] font-black uppercase tracking-wider"
                  >
                    Limpar Período de Datas
                  </Button>
                )}
                {filters.hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={filters.clearFilters}
                    className="text-[10px] font-black uppercase tracking-wider text-functional-error hover:bg-functional-error/10"
                  >
                    Limpar Todos os Filtros
                  </Button>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </Card>
      <div className="flex items-center justify-between gap-3 text-xs text-brand-muted">
        <span>{loading ? 'Carregando resultados...' : total === 0 ? 'Nenhum registro' : `${page * 50 + 1}–${Math.min((page + 1) * 50, total)} de ${total} monitorias`}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage(current => current - 1)}>Anterior</Button>
          <span className="font-semibold">Página {page + 1} de {Math.max(1, Math.ceil(total / 50))}</span>
          <Button size="sm" variant="outline" disabled={(page + 1) * 50 >= total || loading} onClick={() => setPage(current => current + 1)}>Próxima</Button>
        </div>
      </div>
      </>
      )}

      {selectedId && !viewingMonitoria && createPortal(
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/25 dark:bg-black/40 p-0 sm:p-6 backdrop-blur-md" onMouseDown={event => { if (event.target === event.currentTarget) closeDetails(); }}>
          <section data-detail-dialog role="dialog" aria-modal="true" aria-labelledby="monitoria-detail-title" className="flex h-[92vh] sm:h-auto sm:max-h-[calc(100dvh-3rem)] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border-t sm:border border-surface-border bg-surface-card shadow-2xl">
            {(() => {
              const m = selectedDetail;
              if (detailLoading) return <div className="p-6 text-brand-primary" role="status">Carregando ficha...</div>;
              if (!m) return <div className="p-6 text-brand-primary">Monitoria não encontrada.</div>;
              const cfg = getStatusConfig(m.status);
              return <>
                <header className="flex items-start gap-3 border-b border-surface-border p-4 sm:items-center sm:p-6">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${VARIANT_ICON_CONTAINER[cfg.variant]}`}><cfg.icon className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 id="monitoria-detail-title" className="text-base font-black text-brand-primary">Ticket #{m.ticket_id || 'S/N'}</h2>
                      <MonitoriaIdBadge displayId={m.display_id} id={m.id} />
                    </div>
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
                  <MonitoriaDetails monitoria={m} user={user} users={staticData.users} teams={staticData.teams} onView={item => setViewingMonitoria(item)} onAction={modal => setActionModal(modal)} onSendToHelpdesk={item => { closeDetails(); setHelpdeskMonitoria(item); }} />
                </div>
              </>;
            })()}
          </section>
        </div>, document.body
      )}

      {actionModal && createPortal(
          <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center overflow-y-auto bg-black/25 dark:bg-black/40 p-0 sm:p-6 backdrop-blur-md" onMouseDown={event => { if (event.target === event.currentTarget) setActionModal(null); }}>
            <m.div data-action-dialog role="dialog" aria-modal="true" aria-labelledby="monitoria-action-title" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="w-full max-w-md overflow-y-auto rounded-t-3xl sm:rounded-3xl max-h-[92dvh] sm:max-h-[calc(100dvh-3rem)]">
              <Card className="w-full shadow-2xl border-t sm:border border-surface-border bg-surface-card rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe">
                {(() => {
                  const m = selectedDetail?.id === actionModal.id ? selectedDetail : monitorias.find(item => item.id === actionModal.id);
                  const currentSt = m?.status || 'pendente_revisao';
                  const isStepChange = actionModal.type === 'alterar_etapa' || actionModal.type === 'avancar_etapa' || actionModal.type === 'retroceder_etapa';
                  const prev = getPreviousStage(currentSt);
                  const next = getNextStage(currentSt);

                  const modalTitle =
                    actionModal.type === 'avancar_etapa' ? 'Avançar Etapa' :
                    actionModal.type === 'retroceder_etapa' ? 'Retroceder Etapa' :
                    actionModal.type === 'alterar_etapa' ? 'Alterar Etapa da Monitoria' :
                    actionModal.type === 'reabrir' ? 'Reabrir Monitoria' :
                    actionModal.type === 'aceitar' ? 'Aprovação e Aceite' :
                    actionModal.type === 'aprovar' ? 'Aprovar Monitoria' :
                    actionModal.type === 'invalidar' ? 'Decisão Final: Invalidar' :
                    actionModal.type === 'contestar' ? 'Contestar Avaliação' :
                    actionModal.type === 'solicitar_reavaliacao' ? 'Solicitar Reavaliação' :
                    actionModal.type === 'manter'
                      ? (m?.status === 'aguardando_gestor_qualidade' ? 'Negar e devolver ao Suporte' : 'Recusar Contestação') :
                    actionModal.type === 'escalar' ? 'Escalar para GestÃ£o Qualidade' :
                    actionModal.type === 'recusar_agente' ? 'Apelo ao Gestor' :
                    actionModal.type === 'excluir' ? 'Excluir Monitoria' :
                    'Confirmar Ação';

                  const isSupportManager = user?.role === 'gestor_suporte';
                  const isApproval = actionModal.type === 'aprovar' || actionModal.type === 'aceitar';
                  const isContestation = actionModal.type === 'contestar';

                  let noteLabel = 'Justificativa / Motivo (Opcional)';
                  let notePlaceholder = 'Descreva os detalhes desta ação...';
                  let noteRequired = false;

                  if (isSupportManager && isApproval) {
                    noteLabel = 'Ação Corretiva';
                    notePlaceholder = 'Descreva detalhadamente a ação corretiva aplicada para esta monitoria (obrigatório)...';
                    noteRequired = true;
                  } else if (isSupportManager && isContestation) {
                    noteLabel = 'Justificativa da Contestação';
                    notePlaceholder = 'Descreva detalhadamente a justificativa para contestar a avaliação (obrigatório)...';
                    noteRequired = true;
                  } else if ((user?.role === 'gestor_qualidade' || user?.role === 'admin')
                    && actionModal.type === 'aprovar' && currentSt === 'pendente_revisao') {
                    noteLabel = 'Conclusão da Gestão da Qualidade';
                    notePlaceholder = 'Registre a conclusão final que será enviada ao Zendesk (obrigatório)...';
                    noteRequired = true;
                  } else if (isStepChange) {
                    noteLabel = 'Observação da Gestão (Opcional)';
                    notePlaceholder = 'Opcional: Caso deixe em branco, será registrado automaticamente um log padrão no histórico.';
                    noteRequired = false;
                  } else if (actionModal.type === 'reabrir') {
                    noteLabel = 'Motivo da Reabertura (Opcional)';
                    notePlaceholder = 'Opcional: Caso deixe em branco, o sistema registrará a justificativa padrão no histórico.';
                    noteRequired = false;
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
                    actionModal.type === 'invalidar' ||
                    actionModal.type === 'recusar_agente' ||
                    isStepChange
                  );

                  const isSameStage = isStepChange && m && targetStatus === currentSt;

                  return (
                    <>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-brand-primary/5 flex items-center justify-center text-brand-primary shrink-0">
                          {actionModal.type === 'reabrir' ? (
                            <RotateCcw className="w-6 h-6 text-amber-500" />
                          ) : isStepChange ? (
                            <ArrowLeftRight className="w-6 h-6 text-brand-highlight" />
                          ) : (
                            <AlertTriangle className="w-6 h-6" />
                          )}
                        </div>
                        <div>
                          <h3 id="monitoria-action-title" className="text-lg font-black text-brand-primary uppercase tracking-tight">
                            {modalTitle}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Ticket #{m?.ticket_id || 'S/N'}</span>
                            <MonitoriaIdBadge displayId={m?.display_id} id={m?.id} />
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-brand-muted font-medium mb-5 leading-relaxed">
                        {isStepChange
                          ? 'Defina a nova etapa para a qual deseja mover esta monitoria. A transição e seu autor ficarão gravados no histórico.'
                          : actionModal.type === 'reabrir'
                          ? 'A monitoria será reativada no fluxo de trabalho e retornará para a etapa indicada.'
                          : `Você está prestes a realizar a ação de ${modalTitle.toLowerCase()} nesta monitoria. Esta operação ficará registrada no histórico.`}
                      </p>

                      {/* Bloco de Reabertura */}
                      {actionModal.type === 'reabrir' && (
                        <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider text-[10px]">
                              Reabertura Operacional:
                            </span>
                            <Badge variant="warning" size="xs">Reabrir</Badge>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-amber-800 dark:text-amber-300 uppercase tracking-widest ml-1 mb-1.5 block">
                              Retornar para qual etapa?
                            </label>
                            <div className="relative">
                              <select
                                value={reopenStatus}
                                onChange={e => setReopenStatus(e.target.value as any)}
                                className="w-full appearance-none bg-surface-card border border-surface-border rounded-xl p-2.5 pr-10 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/50 transition-all cursor-pointer"
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
                        </div>
                      )}

                      {/* Bloco de Mudança de Etapa (Avançar / Retroceder / Alterar) */}
                      {isStepChange && (
                        <div className="mb-5 p-4 rounded-2xl bg-surface-subtle border border-surface-border space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-brand-muted uppercase tracking-wider text-[10px]">Etapa Atual:</span>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Badge variant={getStatusConfig(currentSt).variant} size="xs">
                                {getStatusConfig(currentSt).shortLabel}
                              </Badge>
                              {getStagePendingAction(currentSt) && <span className="text-[11px] text-brand-muted">({getStagePendingAction(currentSt)})</span>}
                            </div>
                          </div>

                          {/* Atalhos Rápidos com 1 clique */}
                          <div className="flex items-center gap-2 pt-1">
                            {prev && (
                              <button
                                type="button"
                                onClick={() => setTargetStatus(prev)}
                                className={`flex-1 py-2 px-2.5 rounded-xl border text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                  targetStatus === prev
                                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 shadow-xs'
                                    : 'bg-surface-card border-surface-border text-brand-muted hover:text-brand-primary hover:border-brand-primary/30'
                                }`}
                              >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                <span>Retroceder: {getStageLabel(prev)}</span>
                              </button>
                            )}
                            {next && (
                              <button
                                type="button"
                                onClick={() => setTargetStatus(next)}
                                className={`flex-1 py-2 px-2.5 rounded-xl border text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                  targetStatus === next
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
                                    : 'bg-surface-card border-surface-border text-brand-muted hover:text-brand-primary hover:border-brand-primary/30'
                                }`}
                              >
                                <span>Avançar: {getStageLabel(next)}</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div>
                            <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1 mb-1.5 block">
                              Ou escolha outra etapa de destino:
                            </label>
                            <div className="relative">
                              <select
                                value={targetStatus}
                                onChange={e => setTargetStatus(e.target.value as any)}
                                className="w-full appearance-none bg-surface-card border border-surface-border rounded-xl p-2.5 pr-10 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/50 transition-all cursor-pointer"
                              >
                                {STAGES_FLOW.map(stage => (
                                  <option key={stage.status} value={stage.status}>
                                    {stage.label} ({stage.roleLabel})
                                  </option>
                                ))}
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-muted">
                                <ChevronDown className="h-4 w-4" />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {showNoteField && (
                        <div className="mb-4">
                          <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1 mb-2 flex items-center justify-between">
                            <span>{noteLabel}</span>
                            {noteRequired ? (
                              <span className="text-[9px] text-danger font-semibold tracking-normal">Obrigatório</span>
                            ) : (
                              <span className="text-[9px] text-brand-muted font-normal tracking-normal">Opcional</span>
                            )}
                          </label>
                          <textarea
                            className="w-full bg-surface-bg border border-surface-border rounded-xl p-3 text-xs font-medium focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/30 transition-all min-h-[90px] resize-none"
                            placeholder={notePlaceholder}
                            value={actionNote}
                            onChange={e => setActionNote(e.target.value)}
                          />
                        </div>
                      )}

                      {actionModal.type === 'aprovar' && (user?.role === 'gestor_qualidade' || user?.role === 'admin')
                        && m && !isChildTicketMonitoria(m) && (
                        <div className="mb-4 rounded-xl border border-brand-accent/30 bg-brand-accent/5 p-3 text-xs text-brand-primary">
                          <p className="font-bold">Ao aprovar, o sistema enviará ao Zendesk como {m.score >= 75 ? 'Ticket Válido' : 'Ticket Invalidado'} se esta monitoria ainda não tiver sido publicada.</p>
                          <p className="mt-2 font-semibold">Registro do Auditor</p>
                          <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">{m.evaluator_note || 'Sem registro preenchido.'}</p>
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

                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          className="flex-1 h-11 font-black uppercase text-[10px] tracking-widest"
                          onClick={() => setActionModal(null)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          variant="primary"
                          className="flex-1 h-11 font-black uppercase text-[10px] tracking-widest"
                          onClick={async () => {
                            const terminalMonitoria = ['aprovar', 'aceitar', 'invalidar'].includes(actionModal.type)
                              && (user?.role === 'gestor_qualidade' || user?.role === 'admin' || user?.role === 'gestor_suporte')
                              && m && !isChildTicketMonitoria(m) ? m : null;
                            const success = await handleAction();
                            if (success) {
                              closeDetails();
                              if (terminalMonitoria) {
                                const result = await publishEvaluationToHelpdesk(terminalMonitoria.id);
                                if (result?.success) {
                                  toast.success(`Registro do Auditor enviado ao Zendesk no ticket #${terminalMonitoria.ticket_id}.`);
                                } else if (result) {
                                  toast.error(`Monitoria concluída, mas o envio ao Zendesk falhou: ${result.error}`);
                                  setHelpdeskMonitoria(terminalMonitoria);
                                }
                              }
                            }
                          }}
                          disabled={submitting || Boolean(isSameStage)}
                        >
                          {submitting ? 'Processando...' : isSameStage ? 'Selecione outra etapa' : 'Confirmar Ação'}
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </Card>
            </m.div>
          </div>, document.body
      )}

      {viewingMonitoria && (
        <MonitoriaForm
          user={user}
          initialData={viewingMonitoria}
          onCancel={() => setViewingMonitoria(null)}
          onSaved={() => { setViewingMonitoria(null); load(); }}
        />
      )}

      {helpdeskMonitoria && (
        <HelpdeskSendModal
          monitoriaId={helpdeskMonitoria.id}
          ticketId={helpdeskMonitoria.ticket_id}
          suggestedOutcome={helpdeskMonitoria.score >= 75 ? 'positiva' : 'negativa'}
          onClose={() => setHelpdeskMonitoria(null)}
        />
      )}
    </div>
  );
}
