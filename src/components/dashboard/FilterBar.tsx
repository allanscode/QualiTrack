import React from 'react';
import { Search, Users, Calendar, Filter, X, RefreshCw } from 'lucide-react';
import { useDashboard } from './DashboardContext';
import Button from '../ui/Button';

export default function FilterBar() {
  const { filters, setFilters, users, teams, loading, refresh } = useDashboard();

  const handleClear = () => {
    setFilters({
      search: '',
      team: 'all',
      agent: 'all',
      status: 'all',
      channel: 'all',
      period: '30'
    });
  };

  const agents = users.filter(u => u.role === 'suporte');
  
  // Check if any filter is active (excluding the period which always has a value)
  const hasFilters = filters.search !== '' || 
                     filters.team !== 'all' || 
                     filters.agent !== 'all' || 
                     filters.status !== 'all' ||
                     filters.channel !== 'all';

  return (
    <div className="bg-white rounded-3xl border border-surface-border shadow-premium p-4">
      <div className="flex flex-nowrap items-center gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {/* Search */}
        <div className="relative flex-shrink-1 min-w-[200px] w-64">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full pl-11 pr-4 py-2.5 bg-surface-subtle border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-brand-primary/20 transition-all outline-none"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>

        {/* Team Select */}
        <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-surface-subtle flex items-center justify-center text-brand-muted flex-shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <select
            className="bg-transparent border-none text-sm font-bold text-brand-primary outline-none focus:ring-0 cursor-pointer min-w-0"
            value={filters.team}
            onChange={(e) => setFilters({ ...filters, team: e.target.value, agent: 'all' })}
          >
            <option value="all">Todas Equipes</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Agent Select */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            className="bg-transparent border-none text-sm font-bold text-brand-primary outline-none focus:ring-0 cursor-pointer min-w-[120px]"
            value={filters.agent}
            onChange={(e) => setFilters({ ...filters, agent: e.target.value })}
          >
            <option value="all">Todos Agentes</option>
            {agents
              .filter(a => filters.team === 'all' || (a.team_ids && a.team_ids.includes(filters.team)))
              .map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))
            }
          </select>
        </div>

        {/* Status Select */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-surface-subtle flex items-center justify-center text-brand-muted">
            <Filter className="w-4 h-4" />
          </div>
          <select
            className="bg-transparent border-none text-sm font-bold text-brand-primary outline-none focus:ring-0 cursor-pointer min-w-[120px]"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="all">Todos Status</option>
            <option value="pendente_revisao">Aguardando Revisão</option>
            <option value="em_contestacao">Em Reanálise</option>
            <option value="aguardando_gestor_suporte">Aguardando Gestor</option>
            <option value="concluida">Concluída</option>
          </select>
        </div>

        {/* Period Select */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-surface-subtle flex items-center justify-center text-brand-muted">
            <Calendar className="w-4 h-4" />
          </div>
          <select
            className="bg-transparent border-none text-sm font-bold text-brand-primary outline-none focus:ring-0 cursor-pointer min-w-[120px]"
            value={filters.period}
            onChange={(e) => setFilters({ ...filters, period: e.target.value })}
          >
            <option value="7">Últimos 7 dias</option>
            <option value="15">Últimos 15 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0 pl-4 border-l border-surface-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            loading={loading}
            icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
            className="text-brand-muted hover:text-brand-primary"
          >
            Atualizar
          </Button>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              icon={<X className="w-4 h-4" />}
              className="text-error hover:bg-error/5"
            >
              Limpar Filtros
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
