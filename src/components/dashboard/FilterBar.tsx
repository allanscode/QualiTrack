import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Calendar, X, RefreshCw, ChevronDown, UserCheck } from 'lucide-react';
import { useDashboard } from './DashboardContext';
import CustomSelect from '../ui/CustomSelect';
import Button from '../ui/Button';

export default function FilterBar() {
  const { filters, setFilters, users, teams, loading, refresh, user } = useDashboard();

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
           filters.auditorId !== defaults.auditorId;
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

  const activeTeams = useMemo(() => teams.filter(t => t.active !== false), [teams]);
  const activeAgents = useMemo(() => users.filter(u => u.role === 'suporte' && u.active !== false), [users]);
  const activeAuditors = useMemo(() => users.filter(u => (u.role === 'qualidade' || u.role === 'gestor_qualidade' || u.role === 'admin') && u.active !== false), [users]);

  return (
    <div className="bg-white rounded-3xl border border-surface-border shadow-sm p-4">
      <div className="flex flex-nowrap items-end gap-4">
        
        {/* Date Range Group */}
        <div className="flex flex-col">
          <div className="flex items-center gap-3 bg-white border border-surface-border rounded-2xl px-4 h-10 shadow-sm">
            <div className="flex items-center gap-2 relative">
              <Calendar className="w-3.5 h-3.5 text-brand-muted relative z-10 pointer-events-none" />
              <input 
                type="date" 
                value={filters.startDate} 
                onChange={e => setFilters({ ...filters, startDate: e.target.value })} 
                className="bg-transparent border-none p-0 text-xs font-bold text-brand-primary focus:ring-0 w-28 cursor-pointer relative z-0" 
              />
            </div>
            <span className="text-brand-muted font-bold text-[10px] uppercase tracking-widest px-1">até</span>
            <div className="flex items-center gap-2 relative">
              <Calendar className="w-3.5 h-3.5 text-brand-muted relative z-10 pointer-events-none" />
              <input 
                type="date" 
                value={filters.endDate} 
                onChange={e => setFilters({ ...filters, endDate: e.target.value })} 
                className="bg-transparent border-none p-0 text-xs font-bold text-brand-primary focus:ring-0 w-28 cursor-pointer relative z-0" 
              />
            </div>
          </div>
        </div>

        {/* Team Select */}
        <CustomSelect 
          value={filters.teamId}
          options={[{ value: '', label: 'Equipe' }, ...activeTeams.map(t => ({ value: t.id, label: t.name }))]}
          onChange={(val: string) => setFilters({ ...filters, teamId: val, agentId: '' })}
          className="w-48"
        />

        {/* Agent Select */}
        {user?.role !== 'suporte' && (
          <CustomSelect 
            value={filters.agentId}
            options={[
              { value: '', label: 'Suporte' }, 
              ...activeAgents
                .filter(a => !filters.teamId || (a.team_ids && a.team_ids.includes(filters.teamId)))
                .map(a => ({ value: a.id, label: a.name }))
            ]}
            onChange={(val: string) => setFilters({ ...filters, agentId: val })}
            className="w-64"
          />
        )}

        {/* Auditor Select */}
        {user?.role !== 'suporte' && user?.role !== 'qualidade' && (
          <CustomSelect 
            value={filters.auditorId}
            options={[
              { value: '', label: 'Qualidade' },
              ...activeAuditors.map(a => ({ value: a.id, label: a.name }))
            ]}
            onChange={(val: string) => setFilters({ ...filters, auditorId: val })}
            className="w-48"
          />
        )}

        {/* Status Select */}
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
          className="w-48"
        />

        {/* Action Buttons */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0 pl-6 border-l border-surface-border self-center h-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            loading={loading}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            className="text-brand-muted hover:text-brand-primary uppercase text-[10px] tracking-widest font-black"
          >
            Atualizar
          </Button>

          {hasChanged && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              icon={<X className="w-3.5 h-3.5" />}
              className="text-error hover:bg-error/5 uppercase text-[10px] tracking-widest font-black"
            >
              Limpar Filtros
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
