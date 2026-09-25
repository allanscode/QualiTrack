import { User } from '../types';

interface QueueMonitorFilterProps {
  monitors: User[];
  value: string;
  onChange: (monitorId: string) => void;
  found: number;
  assignmentsReady: boolean;
}

export default function QueueMonitorFilter({ monitors, value, onChange, found, assignmentsReady }: QueueMonitorFilterProps) {
  return (
    <div className="flex items-center gap-1.5 min-w-0 shrink-0">
      <label htmlFor="queue-monitor-filter" className="sr-only">
        Monitor de Qualidade
      </label>
      <select
        id="queue-monitor-filter"
        aria-label="Monitor de Qualidade"
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-9 min-w-0 w-full sm:w-44 max-w-full bg-surface-subtle/50 hover:bg-surface-subtle/70 focus:bg-surface-subtle border border-surface-border rounded-lg px-2.5 py-1 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-highlight/60 transition-all cursor-pointer"
      >
        <option value="">Todos os monitores</option>
        {[...monitors].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(monitor => (
          <option key={monitor.id} value={monitor.id}>{monitor.name}</option>
        ))}
      </select>
      {value && (
        <span role="status" className="text-[11px] font-medium text-brand-muted whitespace-nowrap shrink-0">
          {assignmentsReady ? `${found} encontrado${found === 1 ? '' : 's'} nesta página` : 'Carregando atribuições…'}
        </span>
      )}
    </div>
  );
}
