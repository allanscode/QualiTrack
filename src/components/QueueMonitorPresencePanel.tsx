import React from 'react';
import { User } from '../types';
import { setMonitorEligibility } from '../lib/queueDistribution';
import { ChevronDown, Users } from 'lucide-react';
import Card from './ui/Card';
import { toast } from 'sonner';

interface QueueMonitorPresencePanelProps {
  monitors: User[];
  eligibility: Record<string, boolean>;
  onlineUserIds: Set<string>;
  onEligibilityChange: (userId: string, enabled: boolean) => void;
}

export default function QueueMonitorPresencePanel({ monitors, eligibility, onlineUserIds, onEligibilityChange }: QueueMonitorPresencePanelProps) {
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [isExpanded, setIsExpanded] = React.useState(true);

  const handleToggle = async (userId: string, current: boolean) => {
    setTogglingId(userId);
    onEligibilityChange(userId, !current);
    try {
      await setMonitorEligibility(userId, !current);
    } catch (e: any) {
      onEligibilityChange(userId, current);
      toast.error(e?.message || 'Não foi possível atualizar a elegibilidade do monitor.');
    } finally {
      setTogglingId(null);
    }
  };

  if (monitors.length === 0) return null;

  const eligibleOnlineCount = monitors.filter(m => eligibility[m.id] && onlineUserIds.has(m.id)).length;

  return (
    <Card className="p-3 sm:p-3.5 space-y-2 rounded-xl border-surface-border/70">
      <button
        type="button"
        onClick={() => setIsExpanded(expanded => !expanded)}
        className="w-full flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/60"
        aria-expanded={isExpanded}
        aria-controls="queue-monitors-list"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-brand-primary">
          <Users className="w-3.5 h-3.5 shrink-0 opacity-60" />
          <span className="text-[10px] font-black uppercase tracking-wider">Monitores na Triagem</span>
        </span>
        <span className="flex items-center gap-1 text-[9px] font-semibold text-brand-muted uppercase tracking-wide whitespace-nowrap">
          {eligibleOnlineCount}/{monitors.length} aptos online
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <div id="queue-monitors-list" hidden={!isExpanded} className="pt-0.5">
        <div className="flex flex-wrap gap-1.5">
          {monitors.map(monitor => {
          const enabled = Boolean(eligibility[monitor.id]);
          const online = onlineUserIds.has(monitor.id);
          return (
            <button
              key={monitor.id}
              type="button"
              disabled={togglingId === monitor.id}
              onClick={() => handleToggle(monitor.id, enabled)}
              aria-pressed={enabled}
              title={`${monitor.name} — ${online ? 'online' : 'offline'}. ${enabled ? 'Clique para retirar da distribuição' : 'Clique para habilitar na distribuição'}`}
              className={`inline-flex min-w-0 max-w-full items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                enabled && online
                  ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : enabled
                    ? 'bg-amber-500/6 border-amber-500/20 text-amber-700 dark:text-amber-200'
                  : 'bg-surface-subtle/60 border-surface-border/70 text-brand-muted hover:border-brand-accent/30'
              }`}
            >
              <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${online ? 'bg-emerald-500' : 'bg-brand-muted/40'}`} aria-hidden="true" />
              <span className="min-w-0 max-w-44 truncate">{monitor.name}</span>
            </button>
          );
          })}
        </div>
      </div>
    </Card>
  );
}
