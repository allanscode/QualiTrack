import { useMemo, useState } from 'react';
import { AlertOctagon, ChevronDown, ExternalLink, Search } from 'lucide-react';
import type { EvaluationForm, Monitoria, User } from '../../../types';
import { getAgentCriticalErrors } from '../../../lib/criticalErrors';
import { DashboardTile } from '../DashboardTileLayout';
import Card from '../../ui/Card';

type Props = { monitorias: Monitoria[]; forms: EvaluationForm[]; users: User[]; profile: string; isCustomizing?: boolean };

const previewForm = {
  id: 'preview-form', sections: [{ id: 'preview-section', title: 'Atendimento', questions: [
    { id: 'preview-process', text: 'Descumprimento de processo obrigatório', type: 'yes_no_na', is_critical: true },
  ] }], critical_errors: [{ id: 'preview-data', text: 'Exposição de dados do cliente', type: 'yes_no_na' }],
} as EvaluationForm;
const previewMonitorias = [
  { id: 'preview-1', ticket_id: '177437', form_id: previewForm.id, evaluated_id: 'preview-agent-1', evaluated_name: 'Agente exemplo A', team_name: 'Equipe A', answers: { 'preview-process': 'NAO' }, selected_critical_errors: ['preview-data'], form_snapshot: previewForm },
  { id: 'preview-2', ticket_id: '175307', form_id: previewForm.id, evaluated_id: 'preview-agent-2', evaluated_name: 'Agente exemplo B', team_name: 'Equipe B', answers: { 'preview-process': 'NAO' }, form_snapshot: previewForm },
] as unknown as Monitoria[];

export default function CriticalErrorsTable({ monitorias, forms, users, profile, isCustomizing = false }: Props) {
  const [search, setSearch] = useState('');
  const [errorId, setErrorId] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const ranking = useMemo(() => getAgentCriticalErrors(
    isCustomizing ? (profile === 'gestor_suporte' ? previewMonitorias.slice(0, 1) : previewMonitorias) : monitorias,
    isCustomizing ? [previewForm] : forms, users,
  ), [isCustomizing, profile, monitorias, forms, users]);
  const errors = useMemo(() => [...new Map(ranking.flatMap(agent => agent.occurrences.map(error => [error.id, error.label]))).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [ranking]);
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = ranking.filter(agent => {
    const matchingErrors = agent.occurrences.filter(error => !errorId || error.id === errorId);
    return matchingErrors.length > 0 && (!query || [agent.agentName, agent.teamName, ...matchingErrors.map(error => error.label), ...matchingErrors.map(error => error.monitoria.ticket_id)]
      .some(value => value.toLocaleLowerCase('pt-BR').includes(query)));
  }).sort((a, b) => {
    if (!errorId) return 0;
    return b.occurrences.filter(error => error.id === errorId).length - a.occurrences.filter(error => error.id === errorId).length;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * 10, (currentPage + 1) * 10);

  return <DashboardTile type="CriticalErrorsTable" title="Erros Críticos por Agente" profile={profile}>
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-functional-error/10 text-functional-error"><AlertOctagon className="size-5" /></span>
          <div><h3 className="text-sm font-black text-brand-primary">Erros Críticos por Agente</h3><p className="text-xs text-brand-muted">{isCustomizing ? `Prévia ilustrativa${profile === 'gestor_suporte' ? ' · somente equipes do gestor' : ''}` : `${filtered.length} agentes · ${filtered.reduce((sum, agent) => sum + agent.occurrences.filter(error => !errorId || error.id === errorId).length, 0)} ocorrências nas monitorias filtradas`}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-brand-muted" aria-hidden="true" /><span className="sr-only">Buscar agente, ticket ou erro</span><input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Agente, ticket ou erro" className="h-9 w-52 rounded-lg border border-surface-border bg-surface-bg pl-8 pr-2 text-xs text-brand-primary placeholder:text-brand-muted focus-visible:ring-2 focus-visible:ring-brand-accent" /></label>
          <label className="sr-only" htmlFor={`critical-error-${profile}`}>Filtrar erro crítico</label>
          <select id={`critical-error-${profile}`} value={errorId} onChange={event => { setErrorId(event.target.value); setPage(0); setExpanded(null); }} className="h-9 max-w-60 rounded-lg border border-surface-border bg-surface-bg px-2 text-xs text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-accent"><option value="">Todos os erros</option>{errors.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        </div>
      </div>
      <div className="max-h-[520px] overflow-auto custom-scrollbar">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-surface-card text-brand-muted"><tr>{['Agente / Equipe', 'Erros críticos', 'Monitorias afetadas', 'Erro mais frequente', 'Detalhes'].map(label => <th key={label} className="border-b border-surface-border px-4 py-3 font-bold">{label}</th>)}</tr></thead>
          <tbody>{visible.map(agent => {
            const occurrences = agent.occurrences.filter(error => !errorId || error.id === errorId);
            const byType = [...new Map(occurrences.map(error => [error.id, { label: error.label, count: occurrences.filter(item => item.id === error.id).length }])).values()].sort((a, b) => b.count - a.count);
            const affectedCount = new Set(occurrences.map(error => error.monitoria.id)).size;
            return <tr key={agent.agentId} className="border-b border-surface-border/60 align-top">
              <td className="px-4 py-3"><span className="font-bold text-brand-primary">{agent.agentName}</span><span className="block text-brand-muted">{agent.teamName || 'Equipe não informada'}</span></td>
              <td className="px-4 py-3 font-mono font-bold tabular-nums text-functional-error">{occurrences.length}</td>
              <td className="px-4 py-3 tabular-nums text-brand-muted">{affectedCount} de {agent.auditCount}</td>
              <td className="max-w-72 px-4 py-3 text-brand-primary" title={byType[0]?.label}>{byType[0]?.label} <span className="text-brand-muted">({byType[0]?.count})</span></td>
              <td className="px-4 py-3"><button type="button" aria-expanded={expanded === agent.agentId} onClick={() => setExpanded(expanded === agent.agentId ? null : agent.agentId)} className="inline-flex items-center gap-1 rounded text-brand-highlight hover:underline focus-visible:ring-2 focus-visible:ring-brand-accent">{expanded === agent.agentId ? 'Ocultar' : 'Ver avaliações'}<ChevronDown className={`size-3 transition-transform ${expanded === agent.agentId ? 'rotate-180' : ''}`} /></button>
                {expanded === agent.agentId && <div className="mt-3 min-w-72 space-y-2">{occurrences.map(error => <button key={`${error.monitoria.id}-${error.id}`} type="button" disabled={isCustomizing} onClick={() => window.dispatchEvent(new CustomEvent('qualitrack:focus_monitoria', { detail: { monitoriaId: error.monitoria.id, ticketId: error.monitoria.ticket_id } }))} className="flex w-full items-start justify-between gap-2 rounded-lg border border-surface-border bg-surface-subtle p-2 text-left text-brand-primary hover:border-brand-accent focus-visible:ring-2 focus-visible:ring-brand-accent disabled:cursor-default"><span><span className="font-mono font-bold">#{error.monitoria.ticket_id}</span><span className="mt-1 block text-brand-muted">{error.label}</span></span><ExternalLink className="size-3 shrink-0" aria-hidden="true" /></button>)}</div>}</td>
            </tr>;
          })}</tbody>
        </table>
        {visible.length === 0 && <p className="px-5 py-8 text-center text-sm text-brand-muted">Nenhum erro crítico encontrado para estes filtros.</p>}
      </div>
      {pageCount > 1 && <div className="flex items-center justify-end gap-3 border-t border-surface-border px-5 py-3 text-xs text-brand-muted"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="disabled:opacity-40 hover:text-brand-primary">Anterior</button><span>{currentPage + 1} / {pageCount}</span><button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} className="disabled:opacity-40 hover:text-brand-primary">Próxima</button></div>}
    </Card>
  </DashboardTile>;
}
