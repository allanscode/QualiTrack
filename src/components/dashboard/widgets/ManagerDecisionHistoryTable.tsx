import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { History, Search } from 'lucide-react';
import type { Monitoria, User } from '../../../types';
import { getManagerDecisionHistory, type ManagerDecision } from '../../../lib/managerDecisionHistory';
import { getStatusConfig } from '../../../lib/statusHelper';
import { DashboardTile } from '../DashboardTileLayout';
import Card from '../../ui/Card';

type Props = {
  monitorias: Monitoria[];
  users: User[];
  profile: string;
  isCustomizing?: boolean;
};

const previewDecisions: ManagerDecision[] = [
  { monitoria: { id: 'preview-1', ticket_id: '177437', evaluated_name: 'Rafaela Serpa', team_name: 'PJ Bruno', status: 'concluida' } as Monitoria,
    entry: { action: 'Monitoria aprovada pelo Gestor de Suporte', by_id: 'preview-gestor', by_name: 'Gestor de Atendimento', at: '2026-10-06T12:00:00Z' }, kind: 'approval' },
  { monitoria: { id: 'preview-2', ticket_id: '175307', evaluated_name: 'Ronaldo Silva', team_name: 'Revenda', status: 'aguardando_gestor_qualidade' } as Monitoria,
    entry: { action: 'Contestação realizada pelo Gestor de Suporte', by_id: 'preview-gestor', by_name: 'Gestor de Atendimento', at: '2026-10-05T12:00:00Z' }, kind: 'contestation' },
];

export default function ManagerDecisionHistoryTable({ monitorias, users, profile, isCustomizing = false }: Props) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | 'approval' | 'contestation'>('all');
  const [managerId, setManagerId] = useState('');
  const [page, setPage] = useState(0);
  const preview = isCustomizing ? previewDecisions : getManagerDecisionHistory(monitorias, users);
  const managers = useMemo(() => [...new Map(preview.map(item => [item.entry.by_id, item.entry.by_name])).entries()], [preview]);
  const filtered = preview.filter(item => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return (kind === 'all' || item.kind === kind)
      && (!managerId || item.entry.by_id === managerId)
      && (!query || [item.monitoria.ticket_id, item.monitoria.evaluated_name, item.monitoria.team_name, item.entry.by_name, item.entry.action]
        .some(value => value?.toLocaleLowerCase('pt-BR').includes(query)));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * 10, (currentPage + 1) * 10);

  return (
    <DashboardTile type="ManagerDecisionHistoryTable" title="Decisões dos Gestores de Atendimento" profile={profile}>
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-surface-subtle text-brand-highlight"><History className="size-5" /></span>
            <div>
              <h3 className="text-sm font-black text-brand-primary">Decisões dos Gestores de Atendimento</h3>
              <p className="text-xs text-brand-muted">{isCustomizing ? 'Prévia ilustrativa com filtros ativos' : `${filtered.length} decisões das monitorias filtradas`}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
              <span className="sr-only">Buscar decisões</span>
              <input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Ticket, agente ou equipe" className="h-9 w-52 rounded-lg border border-surface-border bg-surface-bg pl-8 pr-2 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent" />
            </label>
            <label className="sr-only" htmlFor={`decision-kind-${profile}`}>Filtrar decisão</label>
            <select id={`decision-kind-${profile}`} value={kind} onChange={event => { setKind(event.target.value as typeof kind); setPage(0); }} className="h-9 rounded-lg border border-surface-border bg-surface-bg px-2 text-xs text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-accent">
              <option value="all">Todas as decisões</option><option value="approval">Aprovadas</option><option value="contestation">Contestadas</option>
            </select>
            <label className="sr-only" htmlFor={`decision-manager-${profile}`}>Filtrar gestor</label>
            <select id={`decision-manager-${profile}`} value={managerId} onChange={event => { setManagerId(event.target.value); setPage(0); }} className="h-9 max-w-44 rounded-lg border border-surface-border bg-surface-bg px-2 text-xs text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-accent">
              <option value="">Todos os gestores</option>{managers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
        </div>
        <div className="max-h-[420px] overflow-auto custom-scrollbar">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-surface-card text-brand-muted"><tr>
              {['Ticket', 'Decisão', 'Gestor', 'Agente / Equipe', 'Quando', 'Status'].map(label => <th key={label} className="border-b border-surface-border px-4 py-3 font-bold">{label}</th>)}
            </tr></thead>
            <tbody>{visible.map(({ monitoria, entry, kind: decisionKind }, index) => (
              <tr key={`${monitoria.id}-${entry.at}-${index}`} className="border-b border-surface-border/60 hover:bg-surface-subtle/60">
                <td className="px-4 py-3 font-mono font-bold text-brand-primary"><button type="button" className="rounded focus-visible:ring-2 focus-visible:ring-brand-accent hover:underline" onClick={() => window.dispatchEvent(new CustomEvent('qualitrack:focus_monitoria', { detail: { monitoriaId: monitoria.id, ticketId: monitoria.ticket_id } }))}>#{monitoria.ticket_id}</button></td>
                <td className="px-4 py-3"><span className={decisionKind === 'approval' ? 'font-semibold text-functional-success' : 'font-semibold text-functional-warning'}>{decisionKind === 'approval' ? 'Aprovada' : 'Contestada'}</span><span className="mt-0.5 block max-w-64 truncate text-brand-muted" title={entry.action}>{entry.action}</span></td>
                <td className="px-4 py-3 text-brand-primary">{entry.by_name || users.find(user => user.id === entry.by_id)?.name || 'Gestor'}</td>
                <td className="px-4 py-3 text-brand-muted">{monitoria.evaluated_name || users.find(user => user.id === monitoria.evaluated_id)?.name || '—'}<span className="block text-[11px]">{monitoria.team_name || '—'}</span></td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-brand-muted">{format(new Date(entry.at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</td>
                <td className="px-4 py-3 text-brand-muted">{getStatusConfig(monitoria.status).shortLabel}</td>
              </tr>
            ))}</tbody>
          </table>
          {visible.length === 0 && <p className="px-5 py-8 text-center text-sm text-brand-muted">Nenhuma decisão encontrada com esses filtros.</p>}
        </div>
        {!isCustomizing && pageCount > 1 && <div className="flex items-center justify-end gap-3 border-t border-surface-border px-5 py-3 text-xs text-brand-muted"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="disabled:opacity-40 hover:text-brand-primary">Anterior</button><span>{currentPage + 1} / {pageCount}</span><button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} className="disabled:opacity-40 hover:text-brand-primary">Próxima</button></div>}
      </Card>
    </DashboardTile>
  );
}
