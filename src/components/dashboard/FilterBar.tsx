import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Calendar, X, RefreshCw, FileText, Layers, List, ChevronDown } from 'lucide-react';
import { useDashboard } from './DashboardContext';
import CustomSelect from '../ui/CustomSelect';
import CustomDatepicker from '../ui/CustomDatepicker';
import { useTheme } from '../../providers/ThemeProvider';
import { m, AnimatePresence } from 'motion/react';
import { getPresetDateRange, detectActivePreset } from '../../lib/dashboardDatePresets';
import ExecutiveReportModal from './widgets/ExecutiveReportModal';
import RootCauseAnalyzerModal from './widgets/RootCauseAnalyzerModal';
import { useFeedbacks } from '../../hooks/useFeedbacks';
import { useQualityConfig } from '../../lib/useQualityConfig';
import { useStaticData } from '../../lib/StaticDataContext';
import { matchesTicketGroup, MISSING_TICKET_GROUP } from '../../lib/dashboardGroupFilter';

export default function FilterBar() {
  const { resolvedTheme } = useTheme();
  const { groups } = useStaticData();
  const { filters, setFilters, users, teams, forms, loading, refreshing, refresh, user, allMonitorias, dashboardRole, refreshCooldownEnd, refreshCooldownRemaining } = useDashboard();
  const { feedbacks } = useFeedbacks(user);
  const { config } = useQualityConfig();
  const hiddenActions = config.dashboardHiddenActions?.[dashboardRole] || [];
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isRootCauseOpen, setIsRootCauseOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActionsOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !actionsMenuRef.current?.contains(event.target)) setIsActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsActionsOpen(false); };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isActionsOpen]);

  const defaults = useMemo(() => ({
    ...getPresetDateRange('mes'),
    teamId: '',
    agentId: '',
    auditorId: '',
  }), []);

  const hasChanged = useMemo(() => {
    return filters.startDate !== defaults.startDate || 
           filters.endDate !== defaults.endDate || 
           filters.teamId !== defaults.teamId || 
           Boolean(filters.groupId) ||
           filters.agentId !== defaults.agentId ||
           filters.auditorId !== defaults.auditorId ||
           filters.status !== '';
  }, [filters, defaults]);

  const handleClear = () => {
    setFilters(prev => ({
      ...prev,
      startDate: defaults.startDate,
      endDate: defaults.endDate,
      teamId: '',
      groupId: '',
      agentId: '',
      auditorId: '',
      status: '',
    }));
  };

  const activePreset = useMemo(() => {
    return detectActivePreset(filters.startDate, filters.endDate);
  }, [filters.startDate, filters.endDate]);

  const handleApplyPreset = (preset: 'dia' | 'mes' | 'ano') => {
    if (activePreset === preset) {
      setFilters(prev => ({
        ...prev,
        startDate: defaults.startDate,
        endDate: defaults.endDate,
      }));
      return;
    }
    const range = getPresetDateRange(preset);
    setFilters(prev => ({
      ...prev,
      startDate: range.startDate,
      endDate: range.endDate,
    }));
  };

  const activeTeams = useMemo(() => {
    let list = teams.filter(t => t.active !== false);
    
    // Filtro para Supervisor de Atendimento ou Agente baseado no dashboardRole
    if (dashboardRole === 'suporte' || dashboardRole === 'gestor_suporte') {
      const myInfo = users.find(u => u.id === user?.id);
      let myTeamIds = myInfo?.team_ids || user?.team_ids || [];
      
      if (myTeamIds.length === 0 && dashboardRole === 'suporte') {
        const fromRecords = allMonitorias.filter(m => m.evaluated_id === user?.id && m.team_id).map(m => m.team_id!);
        myTeamIds = Array.from(new Set(fromRecords));
      }
      
      list = list.filter(t => myTeamIds.includes(t.id));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, user, users, allMonitorias, dashboardRole]);

  const activeAgents = useMemo(() => {
    let list = users.filter(u => u.role === 'suporte' && u.active !== false);
    if (dashboardRole === 'gestor_suporte') {
      const myTeamIds = user?.team_ids || [];
      list = list.filter(u => u.primary_team_id
        ? myTeamIds.includes(u.primary_team_id)
        : u.team_ids?.some(tid => myTeamIds.includes(tid)));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [users, user, dashboardRole]);

  const groupOptions = useMemo(() => {
    const permittedIds = new Set(allMonitorias.map(row => row.ticket_group_team_id).filter(Boolean));
    return [...groups, ...teams].filter(group => permittedIds.has(group.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(group => ({ value: group.id, label: group.name }));
  }, [groups, teams, allMonitorias]);
  const groupScopedMonitorias = useMemo(() => allMonitorias.filter(row => matchesTicketGroup(row, filters.groupId)), [allMonitorias, filters.groupId]);
  const selectedGroupName = filters.groupId === MISSING_TICKET_GROUP ? 'Grupo não registrado'
    : groupOptions.find(group => group.value === filters.groupId)?.label;

  const activeAuditors = useMemo(() => {
    const list = users.filter(u => (u.role === 'qualidade' || u.role === 'gestor_qualidade' || u.role === 'admin') && u.active !== false);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-surface-border/80 bg-surface-card/80 p-2 shadow-premium-sm backdrop-blur-sm">
        {hasChanged && (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-functional-error/20 bg-functional-error/5 px-3 text-xs font-semibold text-functional-error transition-colors hover:bg-functional-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-functional-error/40 cursor-pointer"
            title="Limpar todos os filtros e retornar ao período padrão"
          >
            <X className="w-3.5 h-3.5" />
            Limpar Filtros
          </button>
        )}
        <div className="relative" ref={actionsMenuRef}>
          <button
            type="button"
            onClick={() => setIsActionsOpen(open => !open)}
            aria-haspopup="menu"
            aria-expanded={isActionsOpen}
            aria-label="Abrir ações do dashboard"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-brand-accent/25 bg-brand-accent/10 px-3 text-xs font-bold text-brand-primary shadow-sm transition-all hover:border-brand-accent/40 hover:bg-brand-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/30 active:scale-[0.98] cursor-pointer"
          >
            <List className="size-4 text-brand-accent" />
            <span>Ações</span>
            <ChevronDown className={`size-3.5 text-brand-muted transition-transform ${isActionsOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {isActionsOpen && (
              <m.div
                role="menu"
                aria-label="Ações do dashboard"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-2xl border border-surface-border bg-surface-card p-1.5 shadow-2xl"
              >
                <p className="px-3 pb-1.5 pt-2 text-[9px] font-black uppercase tracking-[0.16em] text-brand-muted">Ações do painel</p>
                {user?.role !== 'suporte' && !hiddenActions.includes('root_cause') && (
                  <button type="button" role="menuitem" onClick={() => { setIsActionsOpen(false); setIsRootCauseOpen(true); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-brand-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-highlight/10 text-brand-highlight"><Layers className="size-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block">Análise das monitorias</span><span className="mt-0.5 block text-[10px] font-medium text-brand-muted">Notas e resultados filtrados</span></span>
                  </button>
                )}
                {user?.role !== 'suporte' && !hiddenActions.includes('executive_report') && (
                  <button type="button" role="menuitem" onClick={() => { setIsActionsOpen(false); setIsReportOpen(true); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-brand-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-accent/10 text-brand-accent"><FileText className="size-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block">Relatório executivo</span><span className="mt-0.5 block text-[10px] font-medium text-brand-muted">Gerar e imprimir relatório</span></span>
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => { setIsActionsOpen(false); void refresh(); }} disabled={loading || refreshing || !!refreshCooldownRemaining} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-brand-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent disabled:cursor-not-allowed disabled:opacity-50">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-accent/10 text-brand-accent"><RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} /></span>
                  <span className="min-w-0 flex-1"><span className="block">{refreshing ? 'Atualizando dados' : 'Atualizar dados'}</span><span className="mt-0.5 block text-[10px] font-medium text-brand-muted">{refreshing ? 'Buscando informações recentes' : refreshCooldownRemaining ? `Disponível em ${refreshCooldownRemaining}` : 'Sincronizar indicadores'}</span></span>
                </button>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="bg-surface-card rounded-2xl sm:rounded-3xl border border-surface-border shadow-premium p-3.5 sm:p-5">
        <div className="flex flex-col lg:flex-row flex-wrap items-stretch lg:items-center gap-3">

          {/* Quick Period Presets (Dia | Mês | Ano) (WQ-21) */}
          <div className="inline-flex items-center justify-center sm:justify-start rounded-2xl bg-surface-subtle p-0.5 border border-surface-border shrink-0">
            <button
              type="button"
              onClick={() => handleApplyPreset('dia')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
                activePreset === 'dia'
                  ? 'bg-brand-accent text-white shadow-sm'
                  : 'text-brand-muted hover:text-brand-primary'
              }`}
            >
              Dia
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('mes')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
                activePreset === 'mes'
                  ? 'bg-brand-accent text-white shadow-sm'
                  : 'text-brand-muted hover:text-brand-primary'
              }`}
            >
              Mês
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('ano')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
                activePreset === 'ano'
                  ? 'bg-brand-accent text-white shadow-sm'
                  : 'text-brand-muted hover:text-brand-primary'
              }`}
            >
              Ano
            </button>
          </div>

          {/* Date Range Group (com gap explícito e separação garantida dos dropdowns) */}
          <div className="flex flex-col min-[360px]:flex-row items-center gap-2 shrink-0 w-full sm:w-auto min-[360px]:min-w-[270px]">
            <CustomDatepicker
              value={filters.startDate}
              onChange={(val: string) => setFilters({ ...filters, startDate: val })}
              placeholder="Data inicial"
              size="sm"
            />
            <span className="text-black dark:text-slate-200 font-bold text-xs shrink-0 px-0.5">até</span>
            <CustomDatepicker
              value={filters.endDate}
              onChange={(val: string) => setFilters({ ...filters, endDate: val })}
              placeholder="Data final"
              size="sm"
            />
          </div>

          {/* Dropdowns com flex-1 e min-w para nunca sobrepor ou colar */}
          <div className="flex-1 min-w-[130px]">
            <CustomSelect
              value={filters.teamId}
              aria-label="Equipe do agente"
              options={[{ value: '', label: 'Equipe do agente' }, ...activeTeams.map(t => ({ value: t.id, label: t.name }))]}
              onChange={(val: string) => setFilters({ ...filters, teamId: val, agentId: '' })}
              size="sm"
            />
          </div>

          <div className="flex-1 min-w-[170px]" title="Grupo registrado no atendimento, independentemente da equipe do agente. Os dois filtros combinam-se quando selecionados.">
            <CustomSelect
              aria-label="Grupo do atendimento"
              value={filters.groupId || ''}
              options={[{ value: '', label: 'Grupo do atendimento' }, ...groupOptions,
                ...(allMonitorias.some(row => !row.ticket_group_team_id)
                  ? [{ value: MISSING_TICKET_GROUP, label: 'Grupo não registrado' }] : [])]}
              onChange={groupId => setFilters({ ...filters, groupId, agentId: '' })}
              size="sm"
            />
          </div>

          {dashboardRole !== 'suporte' && (
            <div className="flex-1 min-w-[130px]">
              <CustomSelect
                value={filters.agentId}
                options={[
                  { value: '', label: 'Agentes' },
                  ...activeAgents
                    .filter(a => !filters.teamId || (a.team_ids && a.team_ids.includes(filters.teamId)))
                    .filter(a => !filters.groupId || groupScopedMonitorias.some(row => row.evaluated_id === a.id))
                    .map(a => ({ value: a.id, label: a.name }))
                ]}
                onChange={(val: string) => setFilters({ ...filters, agentId: val })}
                size="sm"
              />
            </div>
          )}

          {dashboardRole !== 'suporte' && dashboardRole !== 'qualidade' && dashboardRole !== 'gestor_suporte' && (
            <div className="flex-1 min-w-[130px]">
              <CustomSelect
                value={filters.auditorId}
                options={[
                  { value: '', label: 'Monitores' },
                  ...activeAuditors.map(a => ({ value: a.id, label: a.name }))
                ]}
                onChange={(val: string) => setFilters({ ...filters, auditorId: val })}
                size="sm"
              />
            </div>
          )}

          <div className="flex-1 min-w-[130px]">
            <CustomSelect
              value={filters.status}
              options={[
                { value: '', label: 'Status' },
                { value: 'pendente_revisao', label: 'Aguardando Revisão' },
                { value: 'em_contestacao', label: 'Em Reanálise' },
                { value: 'aguardando_gestor_suporte', label: 'Aguardando Gestor' },
                { value: 'concluida', label: 'Concluída' },
                { value: 'contestacao_negada', label: 'Contestação Negada' }
              ]}
              onChange={(val: string) => setFilters({ ...filters, status: val })}
              size="sm"
            />
          </div>

        </div>
      </div>

      {isReportOpen && (
        <ExecutiveReportModal
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          monitorias={groupScopedMonitorias}
          users={users}
          teams={teams}
          forms={forms}
          initialTeamId={filters.teamId}
          groupName={selectedGroupName}
          initialStartDate={filters.startDate}
          initialEndDate={filters.endDate}
          currentUser={user}
        />
      )}

      {isRootCauseOpen && (
        <RootCauseAnalyzerModal
          isOpen={isRootCauseOpen}
          onClose={() => setIsRootCauseOpen(false)}
          monitorias={groupScopedMonitorias}
          forms={forms}
          feedbacks={feedbacks}
          teamName={[teams.find(t => t.id === filters.teamId)?.name || 'Operação Global', selectedGroupName && `Grupo: ${selectedGroupName}`].filter(Boolean).join(' · ')}
        />
      )}
    </div>
  );
}
