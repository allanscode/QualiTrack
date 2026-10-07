import { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ListOrdered, Search } from 'lucide-react';
import type { Monitoria, User } from '../../../types';
import { getAgentEvaluationVolumes, sortAgentEvaluationVolumes } from '../../../lib/agentEvaluationVolume';
import type { AgentEvaluationVolume, EvaluationVolumeSort } from '../../../lib/agentEvaluationVolume';
import { DashboardTile } from '../DashboardTileLayout';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import Select from '../../ui/Select';

type Props = { monitorias: Monitoria[]; users: User[]; profile: string; isCustomizing?: boolean };
const options: { value: EvaluationVolumeSort; label: string }[] = [
  { value: 'total', label: 'Total' }, { value: 'negative', label: 'Negativas' },
  { value: 'positive', label: 'Positivas' }, { value: 'proactive', label: 'Proativas' },
];
const preview: AgentEvaluationVolume[] = [
  { id: 'example-a', name: 'Agente exemplo A', teams: ['Equipe A'], positive: 4, negative: 6, proactive: 2, other: 0, total: 12 },
  { id: 'example-b', name: 'Agente exemplo B', teams: ['Equipe A'], positive: 7, negative: 1, proactive: 3, other: 0, total: 11 },
  { id: 'example-c', name: 'Agente exemplo C', teams: ['Equipe B'], positive: 1, negative: 2, proactive: 5, other: 0, total: 8 },
];
const pageSize = 10;

export default function AgentEvaluationVolumeTable({ monitorias, users, profile, isCustomizing = false }: Props) {
  const [sortBy, setSortBy] = useState<EvaluationVolumeSort>('total');
  const [ascending, setAscending] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const ranking = useMemo(() => isCustomizing
    ? (profile === 'gestor_suporte' ? preview.slice(0, 2) : preview)
    : getAgentEvaluationVolumes(monitorias, users), [isCustomizing, profile, monitorias, users]);
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const sorted = useMemo(() => sortAgentEvaluationVolumes(ranking, sortBy, ascending), [ranking, sortBy, ascending]);
  const filtered = sorted.map((agent, index) => ({ ...agent, position: index + 1 }))
    .filter(agent => !query || [agent.name, ...agent.teams].some(value => value.toLocaleLowerCase('pt-BR').includes(query)));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const totals = filtered.reduce((sum, agent) => ({ positive: sum.positive + agent.positive, negative: sum.negative + agent.negative,
    proactive: sum.proactive + agent.proactive, other: sum.other + agent.other, total: sum.total + agent.total }),
  { positive: 0, negative: 0, proactive: 0, other: 0, total: 0 });
  const showOther = totals.other > 0;
  const columns: { field: EvaluationVolumeSort | 'other'; label: string }[] = [
    { field: 'positive', label: 'Positivas' }, { field: 'negative', label: 'Negativas' },
    { field: 'proactive', label: 'Proativas' }, ...(showOther ? [{ field: 'other' as const, label: 'Outras' }] : []), { field: 'total', label: 'Total' },
  ];

  return <DashboardTile type="AgentEvaluationVolumeTable" title="Avaliações por Agente" profile={profile}>
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-border px-5 py-4">
        <div className="flex items-center gap-3">
          <ListOrdered className="size-5 shrink-0 text-brand-accent" aria-hidden="true" />
          <div><h3 className="text-sm font-black text-brand-primary">Avaliações por Agente</h3>
            <p className="text-xs text-brand-muted">{isCustomizing ? 'Prévia ilustrativa · ' : ''}{filtered.length} {filtered.length === 1 ? 'agente' : 'agentes'} · {totals.total} {totals.total === 1 ? 'avaliação' : 'avaliações'} nos filtros atuais</p></div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="relative w-full min-w-0 sm:w-auto"><span className="sr-only">Buscar agente ou equipe</span>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
            <input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Agente ou equipe"
              className="h-9 w-full rounded-lg border border-surface-border bg-surface-card pl-9 pr-3 text-sm text-brand-primary placeholder:text-brand-muted focus-visible:ring-2 focus-visible:ring-brand-accent sm:w-44" />
          </label>
          <div className="flex items-center gap-2"><span className="text-xs text-brand-muted">Ordenar por</span>
            <Select aria-label="Ordenar avaliações por" options={options} value={sortBy} onChange={event => {
              const selected = options.find(option => option.value === event.target.value);
              if (selected) { setSortBy(selected.value); setPage(0); }
            }} className="h-9 py-1" />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { setAscending(value => !value); setPage(0); }}
            aria-label={ascending ? 'Ordenar do maior para o menor' : 'Ordenar do menor para o maior'}
            icon={ascending ? <ArrowUpNarrowWide className="size-4" /> : <ArrowDownWideNarrow className="size-4" />}>
            {ascending ? 'Menor primeiro' : 'Maior primeiro'}
          </Button>
        </div>
      </div>
      <p className="px-5 py-2 text-xs text-brand-muted sm:hidden">Deslize a tabela para ver todas as quantidades.</p>
      <div className="max-h-[520px] overflow-auto custom-scrollbar">
        <table className="w-full min-w-[640px] text-left text-xs" aria-label="Ranking de avaliações por agente">
          <thead className="sticky top-0 z-10 bg-surface-card text-brand-muted"><tr>
            <th scope="col" className="px-4 py-3 font-bold">Posição</th><th scope="col" className="px-4 py-3 font-bold">Agente / Equipe</th>
            {columns.map(column => <th key={column.field} scope="col" aria-sort={sortBy === column.field ? (ascending ? 'ascending' : 'descending') : undefined}
              className={`px-4 py-3 text-right font-bold ${sortBy === column.field ? 'bg-surface-subtle text-brand-primary' : ''}`}>{column.label}</th>)}
          </tr></thead>
          <tbody>{visible.map(agent => <tr key={agent.id} className="border-t border-surface-border hover:bg-surface-subtle">
            <td className="px-4 py-3 tabular-nums text-brand-muted">{agent.position}</td>
            <th scope="row" className="px-4 py-3 font-semibold text-brand-primary">{agent.name}<span className="block font-normal text-brand-muted">{agent.teams.join(', ') || 'Equipe não informada'}</span></th>
            {columns.map(column => <td key={column.field} className={`px-4 py-3 text-right tabular-nums text-brand-primary ${sortBy === column.field ? 'bg-surface-subtle font-bold' : ''}`}>{agent[column.field]}</td>)}
          </tr>)}</tbody>
          {filtered.length > 0 && <tfoot className="sticky bottom-0 z-10 border-t border-surface-border bg-surface-subtle font-bold text-brand-primary"><tr>
            <th colSpan={2} scope="row" className="px-4 py-3">Total dos agentes encontrados</th>
            {columns.map(column => <td key={column.field} className="px-4 py-3 text-right tabular-nums">{totals[column.field]}</td>)}
          </tr></tfoot>}
        </table>
        {!visible.length && <p className="px-5 py-8 text-center text-sm text-brand-muted">Nenhuma avaliação encontrada. Ajuste os filtros ou a busca.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border px-5 py-3">
        <p className="max-w-2xl text-xs text-brand-muted">Positivas e negativas: pesquisa do cliente. Proativas: sem pesquisa.{showOther && ' Outras: chamados filhos ou registros sem classificação.'}</p>
        {pageCount > 1 && <div className="flex items-center gap-2 text-xs text-brand-muted">
          <Button type="button" size="sm" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</Button>
          <span aria-live="polite">{currentPage + 1} / {pageCount}</span>
          <Button type="button" size="sm" variant="ghost" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Próxima</Button>
        </div>}
      </div>
    </Card>
  </DashboardTile>;
}
