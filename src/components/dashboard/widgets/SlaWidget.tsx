import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { Monitoria, User } from '../../../types';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import SLAClock from '../../ui/SLAClock';

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
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
          <Clock className="w-4 h-4 text-warning" />
        </div>
        <div>
          <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest leading-tight">{title}</h3>
          <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5">
            {pending.length} pendência{pending.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="space-y-2.5 flex-1">
        {pending.length > 0 ? pending.map((m) => {
          const hours = Math.floor((new Date().getTime() - new Date(m.deadline_at || m.created_at).getTime()) / (1000 * 3600));
          const days = Math.floor((new Date().getTime() - new Date(m.created_at).getTime()) / (1000 * 3600 * 24));
          const isCritical = days >= 2;

          return (
            <div key={m.id} className="flex items-center justify-between p-3.5 rounded-2xl border border-surface-border hover:bg-surface-subtle/40 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="info" size="xs">Mon: {m.display_id || m.id.slice(0, 4)}</Badge>
                  <span className="font-mono text-[10px] font-black text-brand-primary">#{m.ticket_id}</span>
                </div>
                <p className="text-[10px] text-brand-muted truncate font-bold uppercase tracking-wider">
                  {m.status === 'pendente_revisao' ? `Qualidade: ${getName(m.evaluator_id)}` : `Suporte: ${getName(m.evaluated_id)}`}
                </p>
              </div>
              <div className="text-right ml-3 flex-shrink-0">
                <SLAClock deadlineAt={m.deadline_at} status={m.status} />
              </div>
            </div>
          );
        }) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-brand-muted py-10 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-surface-subtle flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6 text-surface-border" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma pendência</p>
          </div>
        )}
      </div>
    </Card>
  );
}
