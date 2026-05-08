import React from 'react';
import { useDashboard } from './DashboardContext';
import { Search, XCircle, Filter } from 'lucide-react';

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

  // Filter visibility logic based on role
  const canFilterAgents = user.role !== 'suporte';
  const canFilterAuditors = user.role !== 'suporte' && user.role !== 'qualidade';
  const canFilterTeams = user.role !== 'suporte';

  // Available options
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
    <div className="bg-white p-4 rounded-3xl border border-[#E2E4D8] shadow-sm mb-6 flex flex-wrap items-center gap-2 lg:flex-nowrap lg:overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-2 mr-2">
        <Filter className="w-4 h-4 text-[#7A7D71]" />
        <span className="text-xs font-bold uppercase tracking-widest text-[#7A7D71]">Filtros</span>
      </div>

      {/* Date Range */}
      <div className="flex items-center gap-1.5 bg-[#F9F9F6] border border-[#E2E4D8] rounded-xl px-3 py-2">
        <input 
          type="date" 
          value={filters.startDate} 
          onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} 
          className="bg-transparent border-none p-0 text-xs font-medium text-[#2D3A3A] focus:ring-0 w-[110px]" 
        />
        <span className="text-[#C5C7BB] text-xs">→</span>
        <input 
          type="date" 
          value={filters.endDate} 
          onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} 
          className="bg-transparent border-none p-0 text-xs font-medium text-[#2D3A3A] focus:ring-0 w-[110px]" 
        />
      </div>

      {/* Team Filter */}
      {canFilterTeams && (
        <select
          value={filters.teamId}
          onChange={e => setFilters(f => ({ ...f, teamId: e.target.value }))}
          className="bg-[#F9F9F6] border border-[#E2E4D8] rounded-xl px-3 py-2 text-xs font-medium text-[#2D3A3A] focus:border-[#A7C0A5] focus:outline-none"
        >
          <option value="">Todas as equipes</option>
          {availableTeams.filter(t => t.active !== false).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}

      {/* Agent Filter */}
      {canFilterAgents && (
        <select
          value={filters.agentId}
          onChange={e => setFilters(f => ({ ...f, agentId: e.target.value }))}
          className="bg-[#F9F9F6] border border-[#E2E4D8] rounded-xl px-3 py-2 text-xs font-medium text-[#2D3A3A] focus:border-[#A7C0A5] focus:outline-none"
        >
          <option value="">Todos os agentes</option>
          {availableAgents.filter(u => u.active !== false).map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      )}

      {/* Auditor Filter */}
      {canFilterAuditors && (
        <select
          value={filters.auditorId}
          onChange={e => setFilters(f => ({ ...f, auditorId: e.target.value }))}
          className="bg-[#F9F9F6] border border-[#E2E4D8] rounded-xl px-3 py-2 text-xs font-medium text-[#2D3A3A] focus:border-[#A7C0A5] focus:outline-none"
        >
          <option value="">Todos os auditores</option>
          {availableAuditors.filter(u => u.active !== false).map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      )}

      {/* Form (Operation) Filter */}
      <select
        value={filters.formId}
        onChange={e => setFilters(f => ({ ...f, formId: e.target.value }))}
        className="bg-[#F9F9F6] border border-[#E2E4D8] rounded-xl px-3 py-2 text-xs font-medium text-[#2D3A3A] focus:border-[#A7C0A5] focus:outline-none max-w-[200px] truncate"
      >
        <option value="">Todos os formulários</option>
        {forms.filter(form => form.active !== false).map(form => (
          <option key={form.id} value={form.id}>{form.title}</option>
        ))}
      </select>

      {/* Channel Filter */}
      <select
        value={filters.channel}
        onChange={e => setFilters(f => ({ ...f, channel: e.target.value }))}
        className="bg-[#F9F9F6] border border-[#E2E4D8] rounded-xl px-3 py-2 text-xs font-medium text-[#2D3A3A] focus:border-[#A7C0A5] focus:outline-none"
      >
        <option value="">Todos os canais</option>
        <option value="Chat">Chat</option>
        <option value="Email">Email</option>
        <option value="Telefone">Telefone</option>
        <option value="WhatsApp">WhatsApp</option>
      </select>

      {/* Clear Filters */}
      {hasFilters && (
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-100 bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-colors ml-auto"
        >
          <XCircle className="w-3.5 h-3.5" /> Limpar
        </button>
      )}
    </div>
  );
}
