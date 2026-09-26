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
    <div style={style} id={`monitoria-${m.id}`} className="border-b border-surface-border/50 last:border-b-0">
      <div className="flex min-h-[46px] sm:min-h-[50px] items-center gap-2 p-1.5 sm:gap-3 sm:px-4 sm:py-2 hover:bg-surface-subtle/60 transition-colors">
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
              <span className="text-brand-muted">#{m.display_id || m.id.slice(0, 4)}</span>
              <span aria-hidden="true" className="text-brand-muted/60">&#183;</span>
              <span className="truncate font-mono">{m.ticket_id || 'S/N'}</span>
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
            {m.active !== false && <ActionDeadlineClock actionDeadlineAt={m.action_deadline_at} status={m.status} />}
          </span>
          <span className="hidden sm:flex min-w-[100px] justify-center">
            <Badge variant={config.variant} size="xs" className="uppercase font-black tracking-widest px-2 py-0.5 text-[8.5px]">
              {expired ? 'Concluída Sist.' : config.shortLabel}
            </Badge>
          </span>
          <span className="shrink-0 text-right">
            <span className={`block text-sm sm:text-base font-black tabular-nums leading-tight ${scoreColor}`}>
              {m.score !== undefined ? `${m.score}%` : '—'}
            </span>
            <span className="hidden sm:block text-[9px] font-semibold uppercase text-brand-muted">
              {format(new Date(m.created_at), 'dd MMM yyyy', { locale: ptBR })}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-brand-muted" />
        </button>
        {m.ticket_id && (
          <a
            href={`https://webposto.zendesk.com/agent/tickets/${m.ticket_id.trim()}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir ticket ${m.ticket_id} no Zendesk`}
            className="hidden sm:inline-flex rounded-lg p-1.5 text-brand-muted hover:text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-accent transition-colors"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
