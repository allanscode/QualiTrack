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
    <div className="flex flex-wrap items-center gap-2 min-w-0 w-full sm:w-auto">
      <label htmlFor="queue-monitor-filter" className="text-[10px] font-black uppercase tracking-wider text-brand-muted whitespace-nowrap">
        Monitor de Qualidade
      </label>
      <select
        id="queue-monitor-filter"
        value={value}
        onChange={event => onChange(event.target.value)}
        className="min-w-0 w-full sm:w-48 max-w-full bg-surface-card border border-surface-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/60 cursor-pointer"
      >
        <option value="">Todos os monitores</option>
        {[...monitors].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(monitor => (
          <option key={monitor.id} value={monitor.id}>{monitor.name}</option>
        ))}
      </select>
      {value && (
        <span role="status" className="text-[10px] text-brand-muted whitespace-nowrap">
          {assignmentsReady ? `${found} encontrado${found === 1 ? '' : 's'} nesta página` : 'Carregando atribuições…'}
        </span>
      )}
    </div>
  );
}
