import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { History, Search } from 'lucide-react';
import type { Monitoria, User } from '../../../types';
import Card from '../../ui/Card';
import { getStatusConfig } from '../../../lib/statusHelper';
import { normalizeTimelineText } from '../../../lib/timeline';
import { DashboardTile } from '../DashboardTileLayout';

type Props = { monitorias: Monitoria[]; users: User[]; profile?: string };
type ActionRow = { monitoria: Monitoria; action: string; byId: string; byName: string; at: string; note?: string };

export default function SystemActionHistoryTable({ monitorias, users, profile = 'gestor_qualidade' }: Props) {
  const [search, setSearch] = useState('');
  const actions = useMemo<ActionRow[]>(() => monitorias.flatMap(monitoria =>
    (monitoria.history || []).map(entry => ({
      monitoria, action: entry.action || 'A\u00E7\u00E3o registrada', byId: entry.by_id,
      byName: entry.by_name || users.find(user => user.id === entry.by_id)?.name || 'Usu\u00E1rio',
      at: entry.at, note: entry.note,
    })),
  ).filter(row => Number.isFinite(Date.parse(row.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 250), [monitorias, users]);
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const visible = actions.filter(row => !query || [row.monitoria.ticket_id, row.monitoria.display_id, row.monitoria.evaluated_name, row.monitoria.team_name, normalizeTimelineText(row.action), row.byName, normalizeTimelineText(row.note || '')]
    .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(query))).slice(0, 50);

  return <DashboardTile type="ManagerDecisionHistoryTable" title={'Hist\u00F3rico de a\u00E7\u00F5es do sistema'} profile={profile}><Card padding="none" className="overflow-hidden border border-surface-border shadow-premium">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-surface-subtle text-brand-highlight"><History className="size-5" /></span>
        <div><h3 className="text-sm font-black text-brand-primary">{'Hist\u00F3rico de a\u00E7\u00F5es do sistema'}</h3>
          <p className="text-xs text-brand-muted">{'\u00DAltimas altera\u00E7\u00F5es registradas nas monitorias'} {'\u00B7'} {actions.length} {'eventos recentes'}</p></div>
      </div>
      <label className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
        <span className="sr-only">{'Buscar no hist\u00F3rico de a\u00E7\u00F5es'}</span>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder={'Ticket, a\u00E7\u00E3o, usu\u00E1rio ou equipe'} className="h-9 w-64 max-w-full rounded-lg border border-surface-border bg-surface-bg pl-8 pr-2 text-xs text-brand-primary placeholder:text-brand-muted focus-visible:ring-2 focus-visible:ring-brand-accent" />
      </label>
    </div>
    <div className="max-h-[460px] overflow-auto custom-scrollbar">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-surface-card text-brand-muted"><tr>
          {['Ticket / monitoria', 'A\u00E7\u00E3o', 'Respons\u00E1vel', 'Agente / equipe', 'Data e hora', 'Status atual'].map(label => <th key={label} className="border-b border-surface-border px-4 py-3 font-bold">{label}</th>)}
        </tr></thead>
        <tbody>{visible.map((row, index) => <tr key={`${row.monitoria.id}-${row.at}-${index}`} className="border-b border-surface-border/60 hover:bg-surface-subtle/60">
          <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-brand-primary"><button type="button" className="hover:underline focus-visible:ring-2 focus-visible:ring-brand-accent" onClick={() => window.dispatchEvent(new CustomEvent('qualitrack:focus_monitoria', { detail: { monitoriaId: row.monitoria.id, ticketId: row.monitoria.ticket_id } }))}>#{row.monitoria.ticket_id || 'S/N'}</button><span className="mt-1 block font-sans text-[10px] text-brand-highlight">Monitoria #{String(row.monitoria.display_id || '').padStart(6, '0')}</span></td>
          <td className="max-w-[320px] px-4 py-3"><span className="font-semibold text-brand-primary">{normalizeTimelineText(row.action)}</span>{row.note && <span className="mt-0.5 block max-w-80 truncate text-brand-muted" title={normalizeTimelineText(row.note)}>{normalizeTimelineText(row.note)}</span>}</td>
          <td className="whitespace-nowrap px-4 py-3 text-brand-primary">{row.byName}</td>
          <td className="px-4 py-3 text-brand-muted">{row.monitoria.evaluated_name || '\u2014'}<span className="block text-[11px]">{row.monitoria.team_name || '\u2014'}</span></td>
          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-brand-muted">{format(new Date(row.at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</td>
          <td className="whitespace-nowrap px-4 py-3 text-brand-muted">{getStatusConfig(row.monitoria.status).shortLabel}</td>
        </tr>)}</tbody>
      </table>
      {visible.length === 0 && <p className="px-5 py-8 text-center text-sm text-brand-muted">{'Nenhuma a\u00E7\u00E3o encontrada com esses filtros.'}</p>}
      <p className="border-t border-surface-border px-5 py-2 text-[10px] text-brand-muted">{'A tabela mostra at\u00E9 250 eventos das monitorias dispon\u00EDveis para este painel.'}</p>
    </div>
  </Card></DashboardTile>;
}
