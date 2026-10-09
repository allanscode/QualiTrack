import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Calendar, X, RefreshCw, FileText, Layers } from 'lucide-react';
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

export default function FilterBar() {
  const { resolvedTheme } = useTheme();
  const { filters, setFilters, users, teams, forms, loading, refresh, user, allMonitorias, dashboardRole, refreshCooldownEnd, refreshCooldownRemaining } = useDashboard();
  const { feedbacks } = useFeedbacks(user);
  const { config } = useQualityConfig();
  const hiddenActions = config.dashboardHiddenActions?.[dashboardRole] || [];
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isRootCauseOpen, setIsRootCauseOpen] = useState(false);

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

  const activeAuditors = useMemo(() => {
    const list = users.filter(u => (u.role === 'qualidade' || u.role === 'gestor_qualidade' || u.role === 'admin') && u.active !== false);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end sm:gap-3">
        {hasChanged && (
          <button
            type="button"
            onClick={handleClear}
            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-functional-error hover:bg-functional-error/10 rounded-xl transition-all cursor-pointer"
            title="Limpar todos os filtros e retornar ao período padrão"
          >
            <X className="w-3.5 h-3.5" />
            Limpar Filtros
          </button>
        )}
        {user?.role !== 'suporte' && (
          <>
            {!hiddenActions.includes('root_cause') && (
            <button
              type="button"
              onClick={() => setIsRootCauseOpen(true)}
              className="min-w-0 min-h-10 flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-center text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 rounded-xl transition-all cursor-pointer"
              title="Indicadores das avaliações filtradas e comparação de notas antes e depois do feedback"
            >
              <Layers className="w-3.5 h-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
              <span>Análise das monitorias</span>
            </button>
            )}
            {!hiddenActions.includes('executive_report') && (
            <button
              type="button"
              onClick={() => setIsReportOpen(true)}
              className="min-w-0 min-h-10 flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-center text-xs font-bold text-brand-primary bg-brand-accent/10 hover:bg-brand-accent/20 border border-brand-accent/25 rounded-xl transition-all cursor-pointer"
              title="Gerar e imprimir relatório executivo consolidado em PDF para reunião e envio a gestores"
            >
              <FileText className="w-3.5 h-3.5 shrink-0 text-brand-accent" />
              <span>Relatório Executivo (PDF)</span>
            </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={refresh}
          disabled={loading || !!refreshCooldownRemaining}
          className="col-span-2 sm:col-span-1 min-h-10 flex items-center justify-center gap-2 px-3 py-1.5 text-brand-muted hover:text-brand-primary transition-colors text-xs font-semibold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Atualizando...' : refreshCooldownRemaining ? `Atualizar (${refreshCooldownRemaining})` : 'Atualizar Dados'}
        </button>
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
              options={[{ value: '', label: 'Equipe' }, ...activeTeams.map(t => ({ value: t.id, label: t.name }))]}
              onChange={(val: string) => setFilters({ ...filters, teamId: val, agentId: '' })}
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
          monitorias={allMonitorias}
          users={users}
          teams={teams}
          forms={forms}
          initialTeamId={filters.teamId}
          initialStartDate={filters.startDate}
          initialEndDate={filters.endDate}
          currentUser={user}
        />
      )}

      {isRootCauseOpen && (
        <RootCauseAnalyzerModal
          isOpen={isRootCauseOpen}
          onClose={() => setIsRootCauseOpen(false)}
          monitorias={allMonitorias}
          forms={forms}
          feedbacks={feedbacks}
          teamName={teams.find(t => t.id === filters.teamId)?.name || 'Operação Global'}
        />
      )}
    </div>
  );
}
