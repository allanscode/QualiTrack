import React from 'react';
import { useDashboard } from './DashboardContext';
import { Filter, XCircle } from 'lucide-react';
import Select from '../ui/Select';
import Button from '../ui/Button';

export default function FilterBar() {
  const { user, filters, setFilters, users, teams, forms } = useDashboard();

  if (!user) return null;

  const handleClear = () => {
    setFilters({
      startDate: new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      teamId: '',
      agentId: '',
      auditorId: '',
      formId: '',
      status: '',
      channel: ''
    });
  };

  const hasFilters = filters.teamId || filters.agentId || filters.auditorId || filters.formId || filters.status || filters.channel;

  const canFilterAgents = user.role !== 'suporte';
  const canFilterAuditors = user.role !== 'suporte' && user.role !== 'qualidade';
  const canFilterTeams = true;

  const availableTeams = user.role === 'admin' || user.role === 'gestor_qualidade' || user.role === 'qualidade'
    ? teams 
    : teams.filter(t => user.team_ids?.includes(t.id));

  const availableAgents = canFilterAgents 
    ? users.filter(u => u.role === 'suporte' && (user.role === 'qualidade' || availableTeams.length > 0 ? availableTeams.some(t => u.team_ids?.includes(t.id)) : true))
    : [];

  const availableAuditors = canFilterAuditors
    ? users.filter(u => u.role === 'qualidade')
    : [];

  return (
    <div className="bg-surface-card p-4 rounded-panel border border-surface-border shadow-premium mb-6 flex flex-wrap items-center gap-4 lg:flex-nowrap lg:overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-2 mr-2">
        <Filter className="w-4 h-4 text-brand-muted" />
        <span className="text-xs font-bold uppercase tracking-widest text-brand-muted">Filtros</span>
      </div>

      <div className="flex items-center gap-1.5 bg-surface-bg border border-surface-border rounded-xl px-3 py-2">
        <input 
          type="date" 
          value={filters.startDate} 
          onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} 
          className="bg-transparent border-none p-0 text-xs font-bold text-brand-primary focus:ring-0 w-[110px]" 
        />
        <span className="text-brand-highlight text-xs">→</span>
        <input 
          type="date" 
          value={filters.endDate} 
          onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} 
          className="bg-transparent border-none p-0 text-xs font-bold text-brand-primary focus:ring-0 w-[110px]" 
        />
      </div>

      {canFilterTeams && (
        <Select
          value={filters.teamId}
          onChange={e => setFilters(f => ({ ...f, teamId: e.target.value }))}
          options={[
            { value: '', label: 'Todas as equipes' },
            ...availableTeams.filter(t => t.active !== false).map(t => ({ value: t.id, label: t.name }))
          ]}
        />
      )}

      {canFilterAgents && (
        <Select
          value={filters.agentId}
          onChange={e => setFilters(f => ({ ...f, agentId: e.target.value }))}
          options={[
            { value: '', label: 'Todos os agentes' },
            ...availableAgents.filter(u => u.active !== false).map(u => ({ value: u.id, label: u.name }))
          ]}
        />
      )}

      {canFilterAuditors && (
        <Select
          value={filters.auditorId}
          onChange={e => setFilters(f => ({ ...f, auditorId: e.target.value }))}
          options={[
            { value: '', label: 'Todos os auditores' },
            ...availableAuditors.filter(u => u.active !== false).map(u => ({ value: u.id, label: u.name }))
          ]}
        />
      )}

      {/* Form filter removed as per user request */}

      <Select
        value={filters.channel}
        onChange={e => setFilters(f => ({ ...f, channel: e.target.value }))}
        options={[
          { value: '', label: 'Todos os canais' },
          { value: 'Chat', label: 'Chat' },
          { value: 'Email', label: 'Email' },
          { value: 'Telefone', label: 'Telefone' },
          { value: 'WhatsApp', label: 'WhatsApp' }
        ]}
      />

      {hasFilters && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleClear}
          icon={<XCircle className="w-3.5 h-3.5" />}
          className="ml-auto border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
        >
          Limpar
        </Button>
      )}
    </div>
  );
}
