import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Calendar, X, RefreshCw, ChevronDown, UserCheck } from 'lucide-react';
import { useDashboard } from './DashboardContext';
import CustomSelect from '../ui/CustomSelect';
import Button from '../ui/Button';

export default function FilterBar() {
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
    if (user?.role === 'suporte') {
      const myInfo = users.find(u => u.id === user.id);
      let myTeamIds = myInfo?.team_ids || user.team_ids || [];
      
      // Fallback if no teams in profile
      if (myTeamIds.length === 0) {
        const fromRecords = allMonitorias.filter(m => m.evaluated_id === user.id && m.team_id).map(m => m.team_id!);
        myTeamIds = Array.from(new Set(fromRecords));
      }
      
      list = list.filter(t => myTeamIds.includes(t.id));
    }
    return list;
  }, [teams, user, users, allMonitorias]);

  const activeAgents = useMemo(() => users.filter(u => u.role === 'suporte' && u.active !== false), [users]);
  const activeAuditors = useMemo(() => users.filter(u => (u.role === 'qualidade' || u.role === 'gestor_qualidade' || u.role === 'admin') && u.active !== false), [users]);

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

      <div className="bg-white rounded-3xl border border-surface-border shadow-premium p-4">
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Date Range Group (Always First) */}
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center gap-2 bg-white border border-surface-border rounded-2xl px-3 h-10 shadow-sm group hover:border-brand-accent transition-all relative">
              <div className="flex items-center gap-2 relative flex-1">
                <Calendar className="w-3.5 h-3.5 text-brand-muted relative z-10 pointer-events-none" />
                <input 
                  type="date" 
                  value={filters.startDate} 
                  onChange={e => setFilters({ ...filters, startDate: e.target.value })} 
                  className="bg-transparent border-none p-0 text-[11px] font-bold text-brand-primary focus:ring-0 w-full cursor-pointer relative z-0" 
                />
              </div>
              <span className="text-brand-muted/30 font-black text-[9px] uppercase tracking-widest mx-0.5">até</span>
              <div className="flex items-center gap-2 relative flex-1">
                <Calendar className="w-3.5 h-3.5 text-brand-muted relative z-10 pointer-events-none" />
                <input 
                  type="date" 
                  value={filters.endDate} 
                  onChange={e => setFilters({ ...filters, endDate: e.target.value })} 
                  className="bg-transparent border-none p-0 text-[11px] font-bold text-brand-primary focus:ring-0 w-full cursor-pointer relative z-0" 
                />
              </div>
            </div>
          </div>

          {/* Dropdowns */}
          <div className="flex-1 min-w-[160px] h-10">
            <CustomSelect 
              value={filters.teamId}
              options={[{ value: '', label: 'Equipe' }, ...activeTeams.map(t => ({ value: t.id, label: t.name }))]}
              onChange={(val: string) => setFilters({ ...filters, teamId: val, agentId: '' })}
              className="w-full"
            />
          </div>

          {user?.role !== 'suporte' && (
            <div className="flex-1 min-w-[160px] h-10">
              <CustomSelect 
                value={filters.agentId}
                options={[
                  { value: '', label: 'Suporte' }, 
                  ...activeAgents
                    .filter(a => !filters.teamId || (a.team_ids && a.team_ids.includes(filters.teamId)))
                    .map(a => ({ value: a.id, label: a.name }))
                ]}
                onChange={(val: string) => setFilters({ ...filters, agentId: val })}
                className="w-full"
              />
            </div>
          )}

          {user?.role !== 'suporte' && user?.role !== 'qualidade' && (
            <div className="flex-1 min-w-[160px] h-10">
              <CustomSelect 
                value={filters.auditorId}
                options={[
                  { value: '', label: 'Qualidade' },
                  ...activeAuditors.map(a => ({ value: a.id, label: a.name }))
                ]}
                onChange={(val: string) => setFilters({ ...filters, auditorId: val })}
                className="w-full"
              />
            </div>
          )}

          <div className="flex-1 min-w-[180px] h-10">
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
              className="w-full"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasChanged && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                icon={<X className="w-3.5 h-3.5" />}
                className="text-error hover:bg-error/5 uppercase text-[10px] tracking-widest font-black"
              >
                Limpar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
