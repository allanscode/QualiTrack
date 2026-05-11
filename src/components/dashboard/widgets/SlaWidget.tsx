import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { Monitoria, User } from '../../../types';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';

interface SlaWidgetProps {
  title: string;
  monitorias: Monitoria[];
  users: User[];
  targetStatus: string | string[];
}

export default function SlaWidget({ title, monitorias, users, targetStatus }: SlaWidgetProps) {
  const getName = (id: string) => users.find(u => u.id === id)?.name || id;

  const statuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];
  
  const pending = monitorias
    .filter(m => statuses.includes(m.status) && !['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, 5);

  return (
    <Card padding="lg" className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-5">
        <Clock className="w-5 h-5 text-warning" />
        <h3 className="font-bold text-brand-primary text-lg">{title}</h3>
      </div>
      
      <div className="space-y-3 flex-1">
        {pending.length > 0 ? pending.map((m) => {
          const days = Math.floor((new Date().getTime() - new Date(m.created_at).getTime()) / (1000 * 3600 * 24));
          const isCritical = days >= 2;

          return (
            <div key={m.id} className="flex items-center justify-between p-3 rounded-2xl border border-surface-subtle hover:bg-surface-bg transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <Badge variant="info" size="xs">Mon: {m.display_id || m.id.slice(0,4)}</Badge>
                  <span className="font-mono text-xs font-bold text-brand-primary">Tkt: #{m.ticket_id}</span>
                  {isCritical && <AlertCircle className="w-3.5 h-3.5 text-error" />}
                </div>
                <p className="text-[10px] text-brand-muted truncate font-medium">
                  {m.status === 'pendente_revisao' ? `Avaliador: ${getName(m.evaluator_id)}` : `Agente: ${getName(m.evaluated_id)}`}
                </p>
              </div>
              <div className="text-right ml-3">
                <span className={`text-xs font-bold ${isCritical ? 'text-error' : 'text-warning'}`}>
                  {days === 0 ? 'Hoje' : `Há ${days} dia${days > 1 ? 's' : ''}`}
                </span>
              </div>
            </div>
          );
        }) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-brand-muted py-8">
            <Clock className="w-8 h-8 text-surface-border mb-2" />
            <p className="text-sm font-medium">Nenhuma pendência crítica</p>
          </div>
        )}
      </div>
    </Card>
  );
}
