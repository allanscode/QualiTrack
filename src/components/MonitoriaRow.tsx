import type { CSSProperties } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronRight, ExternalLink, Shield, Tag, User as UserIcon } from 'lucide-react';
import { Monitoria, Team } from '../types';
import { getStatusConfig, VARIANT_ICON_CONTAINER } from '../lib/statusHelper';
import Badge from './ui/Badge';
import ActionDeadlineClock from './ui/ActionDeadlineClock';

type Props = {
  monitoria: Monitoria;
  style?: CSSProperties;
  teams: Team[];
  getName: (id: string, isEvaluator?: boolean, snapshotName?: string) => string;
  getLevelForScore: (score: number) => { color: string };
  onOpen: (id: string) => void;
};

export function MonitoriaRow({ monitoria: m, style, teams, getName, getLevelForScore, onOpen }: Props) {
  const config = getStatusConfig(m.status);
  const level = getLevelForScore(m.score || 0);
  const scoreColor = m.score !== undefined ? level.color : 'text-brand-muted';
  const expired = m.status === 'concluida' && m.resolution_type === 'automatic';
  return (
    <div style={style} id={`monitoria-${m.id}`} className="border-b border-surface-border/60 last:border-b-0">
      <div className="flex min-h-[96px] items-center gap-2.5 p-3 sm:gap-4 sm:p-4 hover:bg-surface-subtle/60 transition-colors">
        <button
          type="button"
          onClick={() => onOpen(m.id)}
          aria-label={`Abrir detalhes da monitoria ${m.display_id || m.ticket_id}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent active:scale-[0.99] transition-transform cursor-pointer"
        >
          <span className={`flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-2xl ${VARIANT_ICON_CONTAINER[config.variant]}`}>
            <config.icon className="size-4 sm:size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs font-black text-brand-primary">
              <span className="text-brand-muted">#{m.display_id || m.id.slice(0, 4)}</span>
              <span aria-hidden="true">&#183;</span>
              <span className="truncate font-mono">{m.ticket_id || 'S/N'}</span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-brand-primary/80">
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
            {/* Status chip visível no mobile */}
            <span className="flex sm:hidden items-center gap-1.5 mt-1">
              <Badge variant={config.variant} size="xs" className="uppercase font-black tracking-wider text-[8px] px-1.5 py-0.5 leading-none">
                {expired ? 'Concluída Sist.' : config.shortLabel}
              </Badge>
              <span className="text-[9px] font-semibold text-brand-muted">
                {format(new Date(m.created_at), 'dd/MM/yy', { locale: ptBR })}
              </span>
            </span>
          </span>
          <span className="hidden md:flex min-w-[140px] justify-center">
            {m.active !== false && <ActionDeadlineClock actionDeadlineAt={m.action_deadline_at} status={m.status} />}
          </span>
          <span className="hidden sm:flex min-w-[110px] justify-center">
            <Badge variant={config.variant} size="xs" className="uppercase font-black tracking-widest px-2">
              {expired ? 'Concluída Sist.' : config.shortLabel}
            </Badge>
          </span>
          <span className="shrink-0 text-right">
            <span className={`block text-base sm:text-lg font-black tabular-nums ${scoreColor}`}>
              {m.score !== undefined ? `${m.score}%` : '—'}
            </span>
            <span className="hidden sm:block text-[10px] font-semibold uppercase text-brand-muted">
              {format(new Date(m.created_at), 'dd MMM yyyy', { locale: ptBR })}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-brand-muted" />
        </button>
        {m.ticket_id && (
          <a
            href={`https://webposto.zendesk.com/agent/tickets/${m.ticket_id.trim()}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir ticket ${m.ticket_id} no Zendesk`}
            className="hidden sm:inline-flex rounded-lg p-2 text-brand-muted hover:text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-accent"
          >
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}
