import { useId, useState } from 'react';
import { History } from 'lucide-react';
import type { Monitoria, User } from '../types';
import { getHistoryEventConfig, getStatusConfig, VARIANT_TEXT_CLASS, type StatusConfig } from '../lib/statusHelper';
import { formatTimelineDateTime, resolveTimelineActor } from '../lib/timeline';
import ActionAttachmentsViewer from './ActionAttachmentsViewer';

const NOTE_ACCENT_CLASS: Record<StatusConfig['variant'], string> = {
  warning: 'border-amber-500/25',
  error: 'border-rose-500/25',
  info: 'border-sky-500/25',
  success: 'border-emerald-500/25',
  neutral: 'border-surface-border/50',
};

function TimelineNote({ text, variant }: { text: string; variant: StatusConfig['variant'] }) {
  const [expanded, setExpanded] = useState(false);
  const noteId = useId();
  const isLong = text.length > 180;

  return (
    <div className={`mt-2 rounded-lg border bg-surface-subtle/60 px-3 py-2.5 ${NOTE_ACCENT_CLASS[variant]}`}>
      <p id={noteId} className={`whitespace-pre-wrap break-words text-xs leading-relaxed text-brand-primary ${isLong && !expanded ? 'line-clamp-2' : ''}`}>
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          aria-controls={noteId}
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
          className="mt-1.5 rounded text-xs font-bold text-brand-highlight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
        >
          {expanded ? 'Recolher observação' : 'Ler observação completa'}
        </button>
      )}
    </div>
  );
}

type Props = { monitoria: Monitoria; user: User | null; users: User[] };

export default function MonitoriaTimeline({ monitoria, user, users }: Props) {
  const history = monitoria.history || [];
  if (history.length === 0) return null;
  const showCurrentStage = !['concluida', 'finalizada_alterada'].includes(monitoria.status);

  return (
    <section className="min-w-0 pb-4" aria-labelledby={`timeline-${monitoria.id}`}>
      <h3 id={`timeline-${monitoria.id}`} className="mb-3 ml-1 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-brand-primary">
        <History className="size-3.5 text-brand-highlight" aria-hidden="true" /> Linha do Tempo
      </h3>
      <ol className="min-w-0">
        {history.map((entry, index) => {
          const event = getHistoryEventConfig(entry.action);
          const EventIcon = event.icon;
          const color = VARIANT_TEXT_CLASS[event.variant];
          const actorName = (user?.role === 'suporte' || user?.role === 'gestor_suporte') && !users.some(actor => actor.id === entry.by_id)
            ? 'Equipe de Qualidade'
            : resolveTimelineActor(entry.by_id, entry.by_name, users, user?.role);

          return (
            <li key={`${entry.at}-${entry.action}-${index}`} className="relative min-w-0 pb-4 pl-7 last:pb-0">
              {(index < history.length - 1 || showCurrentStage) && <span aria-hidden="true" className="absolute bottom-0 left-[5px] top-4 w-px bg-surface-border" />}
              <span aria-hidden="true" className={`absolute left-0 top-1 size-3 rounded-full border-2 border-surface-bg bg-current ${color}`} />
              <div className="min-w-0 border-b border-surface-border/60 pb-3">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="flex min-w-0 items-start gap-2">
                    <EventIcon className={`mt-0.5 size-3.5 shrink-0 ${color}`} aria-hidden="true" />
                    <strong className="min-w-0 text-xs leading-snug text-brand-primary">{entry.action}</strong>
                  </div>
                  <time className="shrink-0 text-[11px] tabular-nums text-brand-muted" dateTime={entry.at}>
                    {formatTimelineDateTime(entry.at, monitoria.created_at)}
                  </time>
                </div>
                <p className="mt-1 pl-[22px] text-[11px] font-medium text-brand-muted">{actorName}</p>
                {entry.note && <TimelineNote text={entry.note} variant={event.variant} />}
                {entry.attachments && entry.attachments.length > 0 && (
                  <div className="mt-2 min-w-0"><ActionAttachmentsViewer attachments={entry.attachments} compact /></div>
                )}
              </div>
            </li>
          );
        })}
        {showCurrentStage && (() => {
          const stage = getStatusConfig(monitoria.status);
          const StageIcon = stage.icon;
          const color = VARIANT_TEXT_CLASS[stage.variant];
          return (
            <li className="relative min-w-0 pl-7">
              <span aria-hidden="true" className={`absolute left-0 top-1 size-3 rounded-full border-2 border-current bg-surface-bg ${color}`} />
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className={`flex min-w-0 items-start gap-2 ${color}`}>
                  <StageIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <strong className="text-xs leading-snug">{stage.label}</strong>
                  <span className="text-[11px] font-medium text-brand-muted">· Etapa atual</span>
                </div>
                <time className="shrink-0 text-[11px] tabular-nums text-brand-muted" dateTime={monitoria.updated_at}>
                  {formatTimelineDateTime(monitoria.updated_at, monitoria.created_at)}
                </time>
              </div>
            </li>
          );
        })()}
      </ol>
    </section>
  );
}
