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
  allowedTeamIds?: string[];
};

const previewDecisions: ManagerDecision[] = [
  { monitoria: { id: 'preview-1', ticket_id: '177437', evaluated_name: 'Rafaela Serpa', team_name: 'PJ Bruno', status: 'concluida' } as Monitoria,
    entry: { action: 'Monitoria aprovada pelo Gestor de Suporte', by_id: 'preview-gestor', by_name: 'Gestor de Atendimento', at: '2026-10-06T12:00:00Z' }, kind: 'approval' },
  { monitoria: { id: 'preview-2', ticket_id: '175307', evaluated_name: 'Ronaldo Silva', team_name: 'Revenda', status: 'aguardando_gestor_qualidade' } as Monitoria,
    entry: { action: 'Contestacao realizada pelo Gestor de Suporte', by_id: 'preview-gestor', by_name: 'Gestor de Atendimento', at: '2026-10-05T12:00:00Z' }, kind: 'contestation' },
  { monitoria: { id: 'preview-3', ticket_id: '183732', evaluated_name: 'Camila Rocha', team_name: 'Revenda', status: 'concluida' } as Monitoria,
    entry: { action: 'Contestacao validada pela Gestao da Qualidade; decisao final', by_id: 'preview-qualidade', by_name: 'Gestora de Qualidade', at: '2026-10-04T12:00:00Z' }, kind: 'approval' },
  { monitoria: { id: 'preview-4', ticket_id: '183701', evaluated_name: 'Diego Ramos', team_name: 'PJ Bruno', status: 'concluida' } as Monitoria,
    entry: { action: 'Monitoria Reavaliada (Concluida)', by_id: 'preview-auditor', by_name: 'Monitora de Qualidade', at: '2026-10-03T12:00:00Z' }, kind: 'reevaluation' },
];

const kindLabel = (kind: ManagerDecision['kind']) => kind === 'approval'
  ? 'Aprova\u00E7\u00E3o'
  : kind === 'contestation' ? 'Contesta\u00E7\u00E3o' : 'Reavalia\u00E7\u00E3o';

export default function ManagerDecisionHistoryTable({ monitorias, users, profile, isCustomizing = false, allowedTeamIds = [] }: Props) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | ManagerDecision['kind']>('all');
  const [managerId, setManagerId] = useState('');
  const [page, setPage] = useState(0);
  const scopedMonitorias = profile === 'gestor_suporte'
    ? monitorias.filter(item => !!item.team_id && allowedTeamIds.includes(item.team_id))
    : monitorias;
  const preview = isCustomizing
    ? (profile === 'gestor_suporte' ? previewDecisions.slice(0, 1) : previewDecisions)
    : getManagerDecisionHistory(scopedMonitorias, users);
  const managers = useMemo(() => [...new Map(preview.map(item => [
    item.entry.by_id,
    item.entry.by_name || users.find(user => user.id === item.entry.by_id)?.name || 'Responsável',
  ])).entries()], [preview, users]);
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
    <DashboardTile type="ManagerDecisionHistoryTable" title={'Painel de decis\u00F5es e reavalia\u00E7\u00F5es'} profile={profile}>
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-surface-subtle text-brand-highlight"><History className="size-5" /></span>
            <div>
              <h3 className="text-sm font-black text-brand-primary">Decis&otilde;es e reavalia&ccedil;&otilde;es</h3>
              <p className="text-xs text-brand-muted">{isCustomizing ? <>Pr&eacute;via ilustrativa{profile === 'gestor_suporte' ? ' · somente equipes do gestor' : ''}</> : <>{filtered.length} decis&otilde;es das monitorias filtradas</>}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
              <span className="sr-only">Buscar decis&otilde;es</span>
              <input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Ticket, agente ou equipe" className="h-9 w-52 rounded-lg border border-surface-border bg-surface-bg pl-8 pr-2 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent" />
            </label>
            <label className="sr-only" htmlFor={`decision-kind-${profile}`}>Filtrar tipo</label>
            <select id={`decision-kind-${profile}`} value={kind} onChange={event => { setKind(event.target.value as typeof kind); setPage(0); }} className="h-9 rounded-lg border border-surface-border bg-surface-bg px-2 text-xs text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-accent">
              <option value="all">Todos</option><option value="approval">Aprova&ccedil;&otilde;es</option><option value="contestation">Contesta&ccedil;&otilde;es</option><option value="reevaluation">Reavalia&ccedil;&otilde;es</option>
            </select>
            <label className="sr-only" htmlFor={`decision-manager-${profile}`}>Filtrar respons&aacute;vel</label>
            <select id={`decision-manager-${profile}`} value={managerId} onChange={event => { setManagerId(event.target.value); setPage(0); }} className="h-9 max-w-44 rounded-lg border border-surface-border bg-surface-bg px-2 text-xs text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-accent">
              <option value="">Todos</option>{managers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
        </div>
        <div className="max-h-[420px] overflow-auto custom-scrollbar">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-surface-card text-brand-muted"><tr>
              {['Ticket', 'Decis\u00E3o', 'Respons\u00E1vel', 'Agente / Equipe', 'Quando', 'Status'].map(label => <th key={label} className="border-b border-surface-border px-4 py-3 font-bold">{label}</th>)}
            </tr></thead>
            <tbody>{visible.map(({ monitoria, entry, kind: decisionKind }, index) => (
              <tr key={`${monitoria.id}-${entry.at}-${index}`} className="border-b border-surface-border/60 hover:bg-surface-subtle/60">
                <td className="px-4 py-3 font-mono font-bold text-brand-primary"><button type="button" className="rounded focus-visible:ring-2 focus-visible:ring-brand-accent hover:underline" onClick={() => window.dispatchEvent(new CustomEvent('qualitrack:focus_monitoria', { detail: { monitoriaId: monitoria.id, ticketId: monitoria.ticket_id } }))}>#{monitoria.ticket_id}</button></td>
                <td className="px-4 py-3"><span className={decisionKind === 'approval' ? 'font-semibold text-functional-success' : decisionKind === 'contestation' ? 'font-semibold text-functional-warning' : 'font-semibold text-brand-highlight'}>{kindLabel(decisionKind)}</span><span className="mt-0.5 block max-w-64 truncate text-brand-muted" title={entry.action}>{entry.action}</span></td>
                <td className="px-4 py-3 text-brand-primary">{entry.by_name || users.find(user => user.id === entry.by_id)?.name || 'Responsável'}</td>
                <td className="px-4 py-3 text-brand-muted">{monitoria.evaluated_name || users.find(user => user.id === monitoria.evaluated_id)?.name || '—'}<span className="block text-[11px]">{monitoria.team_name || '—'}</span></td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-brand-muted">{format(new Date(entry.at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</td>
                <td className="px-4 py-3 text-brand-muted">{getStatusConfig(monitoria.status).shortLabel}</td>
              </tr>
            ))}</tbody>
          </table>
          {visible.length === 0 && <p className="px-5 py-8 text-center text-sm text-brand-muted">Nenhuma decis&atilde;o encontrada com esses filtros.</p>}
        </div>
        {!isCustomizing && pageCount > 1 && <div className="flex items-center justify-end gap-3 border-t border-surface-border px-5 py-3 text-xs text-brand-muted"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="disabled:opacity-40 hover:text-brand-primary">Anterior</button><span>{currentPage + 1} / {pageCount}</span><button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} className="disabled:opacity-40 hover:text-brand-primary">Pr&oacute;xima</button></div>}
      </Card>
    </DashboardTile>
  );
}
