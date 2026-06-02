import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Calendar, X, RefreshCw } from 'lucide-react';
import { useDashboard } from './DashboardContext';
import CustomSelect from '../ui/CustomSelect';
import CustomDatepicker from '../ui/CustomDatepicker';
import { useTheme } from '../../App';
import { motion, AnimatePresence } from 'motion/react';

export default function FilterBar() {
  const { resolvedTheme } = useTheme();
  const { filters, setFilters, users, teams, loading, refresh, user, allMonitorias } = useDashboard();

  const defaults = useMemo(() => ({
    startDate: new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
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

  const activeTeams = useMemo(() => {
    let list = teams.filter(t => t.active !== false);
    
    // Filtro para Supervisor de Atendimento ou Agente
    if (user?.role === 'suporte' || user?.role === 'gestor_suporte') {
      const myInfo = users.find(u => u.id === user.id);
      let myTeamIds = myInfo?.team_ids || user.team_ids || [];
      
      if (myTeamIds.length === 0 && user?.role === 'suporte') {
        const fromRecords = allMonitorias.filter(m => m.evaluated_id === user.id && m.team_id).map(m => m.team_id!);
        myTeamIds = Array.from(new Set(fromRecords));
      }
      
      list = list.filter(t => myTeamIds.includes(t.id));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, user, users, allMonitorias]);

  const activeAgents = useMemo(() => {
    let list = users.filter(u => u.role === 'suporte' && u.active !== false);
    if (user?.role === 'gestor_suporte') {
      const myTeamIds = user.team_ids || [];
      list = list.filter(u => u.team_ids?.some(tid => myTeamIds.includes(tid)));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [users, user]);

  const activeAuditors = useMemo(() => {
    const list = users.filter(u => (u.role === 'qualidade' || u.role === 'gestor_qualidade' || u.role === 'admin') && u.active !== false);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-brand-muted hover:text-brand-primary transition-colors text-[10px] font-black uppercase tracking-widest"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Atualizando...' : 'Atualizar Dados'}
        </button>
      </div>

      <div className="bg-surface-card rounded-3xl border border-surface-border shadow-premium p-6">
        <div className="flex flex-wrap items-center gap-2">

          {/* Date Range Group (Always First) */}
          <div className="flex items-center gap-x-2 flex-[1.8] min-w-[260px]">
            <CustomDatepicker
              value={filters.startDate}
              onChange={(val: string) => setFilters({ ...filters, startDate: val })}
              placeholder="Data inicial"
              size="sm"
            />
            <span className="text-brand-muted/30 font-black text-[9px] uppercase tracking-widest shrink-0">até</span>
            <CustomDatepicker
              value={filters.endDate}
              onChange={(val: string) => setFilters({ ...filters, endDate: val })}
              placeholder="Data final"
              size="sm"
            />
          </div>

          {/* Dropdowns */}
          <CustomSelect
            value={filters.teamId}
            options={[{ value: '', label: 'Equipe' }, ...activeTeams.map(t => ({ value: t.id, label: t.name }))]}
            onChange={(val: string) => setFilters({ ...filters, teamId: val, agentId: '' })}
            size="sm"
          />

          {user?.role !== 'suporte' && (
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
          )}

          {user?.role !== 'suporte' && user?.role !== 'qualidade' && user?.role !== 'gestor_suporte' && (
            <CustomSelect
              value={filters.auditorId}
              options={[
                { value: '', label: 'Monitores' },
                ...activeAuditors.map(a => ({ value: a.id, label: a.name }))
              ]}
              onChange={(val: string) => setFilters({ ...filters, auditorId: val })}
              size="sm"
            />
          )}

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

          {/* Action Buttons — animated clean button */}
          <AnimatePresence>
            {hasChanged && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 28, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden flex-shrink-0 flex items-center justify-center"
              >
                <button
                  onClick={handleClear}
                  className="w-7 h-7 rounded-full bg-functional-error/10 text-functional-error hover:bg-functional-error hover:text-white transition-all flex items-center justify-center shadow-sm cursor-pointer"
                  title="Limpar filtros"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
