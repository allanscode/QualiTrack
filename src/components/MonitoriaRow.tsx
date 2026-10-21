import type { CSSProperties } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronRight, History, Shield, Tag, User as UserIcon } from 'lucide-react';
import { Monitoria, Team } from '../types';
import { getStatusConfig, VARIANT_ICON_CONTAINER } from '../lib/statusHelper';
import Badge from './ui/Badge';
import MonitoriaIdBadge from './ui/MonitoriaIdBadge';
import ActionDeadlineClock from './ui/ActionDeadlineClock';
import { isChildTicketMonitoria, legacyChildNoteVerdict } from '../lib/childTicketForm';
import { childVerdict as getChildVerdict } from '../lib/childTicketForm';

type Props = {
  monitoria: Monitoria;
  style?: CSSProperties;
  teams: Team[];
  getName: (id: string, isEvaluator?: boolean, snapshotName?: string) => string;
  getLevelForScore: (score: number) => { color: string };
  onOpen: (id: string) => void;
  displayMode?: 'table' | 'card';
};

export function MonitoriaRow({ monitoria: m, style, teams, getName, getLevelForScore, onOpen, displayMode = 'card' }: Props) {
  const config = getStatusConfig(m.status);
  const legacyVerdict = legacyChildNoteVerdict(m);
  const level = getLevelForScore(m.score || 0);
  const child = isChildTicketMonitoria(m);
  const savedChildVerdict = m.child_verdict
    || (m.form_snapshot as { child_verdict?: 'valido' | 'invalido' } | undefined)?.child_verdict;
  const finalChildVerdict = child
    ? savedChildVerdict || getChildVerdict(m.answers, m.form_snapshot)
    : null;
  const scoreColor = !child && m.score != null ? level.color : 'text-brand-muted';
  const expired = m.status === 'concluida' && m.resolution_type === 'automatic';
  const latestAction = [...(m.history || [])]
    .filter(entry => entry.action && !Number.isNaN(Date.parse(entry.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const lastUpdatedAt = !Number.isNaN(Date.parse(m.updated_at)) ? m.updated_at : latestAction?.at || m.created_at;
  return (
    <div style={style} id={`monitoria-${m.id}`} className="border-b border-surface-border/50 last:border-b-0">
      {displayMode === 'table' && <div role="row" className="hidden min-w-[1440px] min-h-[64px] grid-cols-[142px_145px_100px_minmax(120px,1fr)_minmax(110px,.8fr)_minmax(130px,1fr)_95px_105px_145px_145px_34px] items-center gap-2 px-4 text-xs transition-colors hover:bg-surface-subtle/60 lg:grid">
        <span role="cell" className="flex min-w-0 flex-col items-start gap-1">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-brand-muted"><config.icon className="size-3.5" />{config.shortLabel}</span>
          <Badge variant={config.variant} size="xs" className="max-w-full truncate">{expired ? 'Concluída sist.' : config.label}</Badge>
        </span>
        <span role="cell" className="min-w-0">
          <button type="button" onClick={() => onOpen(m.id)} aria-label={`Abrir detalhes da monitoria ${m.display_id || m.ticket_id}`} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent">
            <MonitoriaIdBadge displayId={m.display_id} id={m.id} />
          </button>
        </span>
        <span role="cell" className="min-w-0 font-mono font-semibold tabular-nums text-brand-primary">
          {m.ticket_id || 'S/N'}
        </span>
        <span role="cell" className="min-w-0 truncate" title={m.evaluated_name || undefined}>{getName(m.evaluated_id, false, m.evaluated_name)}</span>
        <span role="cell" className="min-w-0 truncate" title={m.team_name || undefined}>{m.team_name || teams.find(team => team.id === m.team_id)?.name || 'N/A'}</span>
        <span role="cell" className="min-w-0 truncate" title={m.evaluator_name || undefined}>{getName(m.evaluator_id, true, m.evaluator_name)}</span>
        <span role="cell"><Badge variant={child ? 'info' : 'neutral'} size="xs">{child ? 'Ticket filho' : 'Atendimento'}</Badge></span>
        <span role="cell" className="min-w-0">
          {child && finalChildVerdict ? <Badge variant={finalChildVerdict === 'valido' ? 'success' : 'error'} size="xs">{finalChildVerdict === 'valido' ? 'Válido' : 'Inválido'}</Badge>
            : child ? <span className="text-brand-muted">Pendente</span>
              : <span className={`font-bold tabular-nums ${scoreColor}`} title={legacyVerdict ? 'Nota original do parecer legado' : undefined}>{m.score != null ? `${m.score}%` : '—'}</span>}
        </span>
        <span role="cell" className="min-w-0 text-[10px] leading-tight tabular-nums text-brand-muted" title={format(new Date(m.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}>
          {format(new Date(m.created_at), 'dd/MM/yyyy', { locale: ptBR })}<br />{format(new Date(m.created_at), 'HH:mm', { locale: ptBR })}
        </span>
        <span role="cell" className="min-w-0">
          {m.active !== false && m.action_deadline_at
            ? <ActionDeadlineClock actionDeadlineAt={m.action_deadline_at} status={m.status} zendeskClosure={Boolean(legacyVerdict && m.status !== 'concluida')} />
            : <span className="text-[10px] text-brand-muted">{m.status === 'concluida' ? 'Concluída' : '—'}</span>}
        </span>
        <span role="cell" className="flex justify-end">
          <button type="button" onClick={() => onOpen(m.id)} aria-label={`Abrir monitoria ${m.display_id || m.ticket_id}`} title="Abrir monitoria" className="rounded-md p-1.5 text-brand-muted hover:bg-surface-subtle hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"><ChevronRight className="size-4" /></button>
        </span>
      </div>}
      <div className={`flex min-h-[68px] sm:min-h-[72px] items-center gap-2 p-2 sm:gap-3 sm:px-4 sm:py-2.5 hover:bg-surface-subtle/60 transition-colors ${displayMode === 'table' ? 'lg:hidden' : ''}`}>
        <button
          type="button"
          onClick={() => onOpen(m.id)}
          aria-label={`Abrir detalhes da monitoria ${m.display_id || m.ticket_id}`}
          className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent active:scale-[0.99] transition-transform cursor-pointer"
        >
          <span className={`flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg ${VARIANT_ICON_CONTAINER[config.variant]}`}>
            <config.icon className="size-3.5 sm:size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-xs font-black text-brand-primary leading-tight">
              <MonitoriaIdBadge displayId={m.display_id} id={m.id} />
              <span className="truncate font-mono">{m.ticket_id || 'S/N'}</span>
              {isChildTicketMonitoria(m) && (
                <Badge variant="info" size="xs" className="shrink-0 text-[8px] uppercase tracking-wide" title="Monitoria de ticket filho">
                  Ticket filho
                </Badge>
              )}
              {finalChildVerdict && (
                <Badge variant={finalChildVerdict === 'valido' ? 'success' : 'error'} size="xs" className="shrink-0 text-[8px] uppercase tracking-wide">
                  {finalChildVerdict === 'valido' ? 'Válido' : 'Inválido'}
                </Badge>
              )}
              {legacyVerdict && (
                <Badge variant="warning" size="xs" className="shrink-0 text-[8px] uppercase tracking-wide"
                  title="Parecer histórico de 3 critérios publicado no Zendesk; não representa a ficha atual de 6 critérios">
                  Legado · {legacyVerdict === 'valido' ? 'Válido' : 'Inválido'}
                </Badge>
              )}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] sm:text-[10.5px] font-medium text-brand-primary/75">
              <span className="inline-flex items-center gap-1">
                <UserIcon className="size-3 text-brand-highlight" />
                {getName(m.evaluated_id, false, m.evaluated_name)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Tag className="size-3 text-brand-highlight" />
                {m.team_name || teams.find(t => t.id === m.team_id)?.name || 'N/A'}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1">
                <Shield className="size-3 text-brand-highlight" />
                {getName(m.evaluator_id, true, m.evaluator_name)}
              </span>
            </span>
            <span className="mt-1 flex min-w-0 items-center gap-1 text-[9px] sm:text-[10px] text-brand-muted" title={latestAction ? `${latestAction.action} · ${latestAction.by_name} · ${format(new Date(latestAction.at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}` : undefined}>
              <History className="size-3 shrink-0" aria-hidden="true" />
              <span className="shrink-0 font-semibold">Atualizado {format(new Date(lastUpdatedAt), 'dd/MM HH:mm', { locale: ptBR })} ·</span>
              {latestAction && <span className="truncate">{latestAction.action}</span>}
            </span>
            {/* Status chip visível no mobile */}
            <span className="flex sm:hidden items-center gap-1.5 mt-0.5">
              <Badge variant={config.variant} size="xs" className="uppercase font-black tracking-wider text-[8px] px-1.5 py-0.2 leading-none">
                {expired ? 'Concluída Sist.' : config.shortLabel}
              </Badge>
              <span className="text-[8.5px] font-semibold text-brand-muted">
                {format(new Date(m.created_at), 'dd/MM/yy', { locale: ptBR })}
              </span>
            </span>
          </span>
          <span className="hidden md:flex min-w-[130px] justify-center">
            {m.active !== false && <ActionDeadlineClock actionDeadlineAt={m.action_deadline_at} status={m.status}
              zendeskClosure={Boolean(legacyVerdict && m.status !== 'concluida')} />}
          </span>
          <span className="hidden sm:flex min-w-[100px] justify-center">
            <Badge variant={config.variant} size="xs" className="uppercase font-black tracking-widest px-2 py-0.5 text-[8.5px]">
              {expired ? 'Concluída Sist.' : config.shortLabel}
            </Badge>
          </span>
          <span className="shrink-0 text-right">
            <span className={`block text-sm sm:text-base font-black tabular-nums leading-tight ${scoreColor}`}
              title={legacyVerdict ? 'Nota original do parecer legado de 3 critérios' : undefined}>
              {child ? (finalChildVerdict === 'valido' ? 'Válido' : finalChildVerdict === 'invalido' ? 'Inválido' : 'Filho') : m.score != null ? `${m.score}%` : '—'}
            </span>
            <span className="hidden sm:block text-[9px] font-semibold uppercase text-brand-muted">
              {format(new Date(m.created_at), 'dd MMM yyyy', { locale: ptBR })}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-brand-muted" />
        </button>
      </div>
    </div>
  );
}
