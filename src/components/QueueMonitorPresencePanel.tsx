import React from 'react';
import { User } from '../types';
import { setMonitorPresence } from '../lib/queueDistribution';
import { ChevronDown, Power, Users } from 'lucide-react';
import Card from './ui/Card';
import { toast } from 'sonner';

interface QueueMonitorPresencePanelProps {
  monitors: User[];
  presence: Record<string, boolean>;
  onPresenceChange: (userId: string, online: boolean) => void;
}

export default function QueueMonitorPresencePanel({ monitors, presence, onPresenceChange }: QueueMonitorPresencePanelProps) {
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [isExpanded, setIsExpanded] = React.useState(true);

  const handleToggle = async (userId: string, current: boolean) => {
    setTogglingId(userId);
    // Otimista: a tela reage na hora, e desfaz se a chamada falhar.
    onPresenceChange(userId, !current);
    try {
      await setMonitorPresence(userId, !current);
    } catch (e: any) {
      onPresenceChange(userId, current);
      toast.error(e?.message || 'Não foi possível atualizar a presença do monitor.');
    } finally {
      setTogglingId(null);
    }
  };

  if (monitors.length === 0) return null;

  const onlineCount = monitors.filter(m => presence[m.id]).length;

  return (
    <Card className="p-4 space-y-3 rounded-xl border-surface-border">
      <button
        type="button"
        onClick={() => setIsExpanded(expanded => !expanded)}
        className="w-full flex items-center justify-between gap-2 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/60"
        aria-expanded={isExpanded}
        aria-controls="queue-monitors-list"
      >
        <span className="flex items-center gap-2 text-brand-primary">
          <Users className="w-4 h-4 opacity-70" />
          <p className="text-xs font-black uppercase tracking-wider">Monitores na Triagem</p>
        </span>
        <span className="flex items-center gap-2 text-[10px] font-bold text-brand-muted uppercase tracking-widest">
          {onlineCount}/{monitors.length} online
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <div id="queue-monitors-list" hidden={!isExpanded} className="flex flex-wrap gap-2">
        {monitors.map(monitor => {
          const online = Boolean(presence[monitor.id]);
          return (
            <button
              key={monitor.id}
              type="button"
              disabled={togglingId === monitor.id}
              onClick={() => handleToggle(monitor.id, online)}
              title={online ? 'Clique para colocar offline' : 'Clique para colocar online'}
              className={`flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer disabled:opacity-60 ${
                online
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-surface-subtle border-surface-border text-brand-muted hover:border-brand-accent/40'
              }`}
            >
              <Power className={`w-3 h-3 ${online ? 'text-emerald-500' : 'text-brand-muted/60'}`} />
              <span>{monitor.name}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-500 animate-pulse' : 'bg-brand-muted/40'}`} />
            </button>
          );
        })}
      </div>
    </Card>
  );
}
