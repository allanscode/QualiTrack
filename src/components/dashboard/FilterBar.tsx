import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Calendar, X, RefreshCw, ChevronDown, UserCheck } from 'lucide-react';
import { useDashboard } from './DashboardContext';
import Button from '../ui/Button';

// Custom Select Component for a modern look
function CustomSelect({ label, value, options, onChange, placeholder = "Selecionar..." }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt: any) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col min-w-[140px] relative" ref={containerRef}>
      <span className="text-[10px] font-black text-brand-muted uppercase tracking-widest mb-1 ml-1">{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between bg-surface-subtle border border-surface-border rounded-xl px-3 py-2 text-sm font-bold text-brand-primary hover:border-brand-primary/20 transition-all"
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-surface-border rounded-2xl shadow-xl z-50 max-h-60 overflow-auto py-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {options.map((opt: any) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors hover:bg-brand-primary/5 ${value === opt.value ? 'text-brand-primary bg-brand-primary/5' : 'text-brand-muted'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilterBar() {
  const { filters, setFilters, users, teams, loading, refresh } = useDashboard();

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
          <span className="text-[10px] font-black text-brand-muted uppercase tracking-widest mb-1 ml-1">Período</span>
          <div className="flex items-center gap-3 bg-surface-subtle border border-surface-border rounded-xl px-4 py-1.5 h-[38px]">
            <div className="flex items-center gap-2 relative">
              <Calendar className="w-3.5 h-3.5 text-brand-muted relative z-10 pointer-events-none" />
              <input 
                type="date" 
                value={filters.startDate} 
                onChange={e => setFilters({ ...filters, startDate: e.target.value })} 
                className="bg-transparent border-none p-0 text-sm font-bold text-brand-primary focus:ring-0 w-28 cursor-pointer relative z-0" 
              />
            </div>
            <span className="text-brand-muted font-bold text-[10px] uppercase tracking-widest px-1">até</span>
            <div className="flex items-center gap-2 relative">
              <Calendar className="w-3.5 h-3.5 text-brand-muted relative z-10 pointer-events-none" />
              <input 
                type="date" 
                value={filters.endDate} 
                onChange={e => setFilters({ ...filters, endDate: e.target.value })} 
                className="bg-transparent border-none p-0 text-sm font-bold text-brand-primary focus:ring-0 w-28 cursor-pointer relative z-0" 
              />
            </div>
          </div>
        </div>

        {/* Team Select */}
        <CustomSelect 
          label="Equipe"
          value={filters.teamId}
          options={[{ value: '', label: 'Todas' }, ...activeTeams.map(t => ({ value: t.id, label: t.name }))]}
          onChange={(val: string) => setFilters({ ...filters, teamId: val, agentId: '' })}
        />

        {/* Agent Select */}
        <CustomSelect 
          label="Agente"
          value={filters.agentId}
          options={[
            { value: '', label: 'Todos' }, 
            ...activeAgents
              .filter(a => !filters.teamId || (a.team_ids && a.team_ids.includes(filters.teamId)))
              .map(a => ({ value: a.id, label: a.name }))
          ]}
          onChange={(val: string) => setFilters({ ...filters, agentId: val })}
        />

        {/* Auditor Select */}
        <CustomSelect 
          label="Auditores"
          value={filters.auditorId}
          options={[
            { value: '', label: 'Todos' },
            ...activeAuditors.map(a => ({ value: a.id, label: a.name }))
          ]}
          onChange={(val: string) => setFilters({ ...filters, auditorId: val })}
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
