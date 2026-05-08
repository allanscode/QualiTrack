import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { Monitoria, User } from '../../../types';

interface SlaWidgetProps {
  title: string;
  monitorias: Monitoria[];
  users: User[];
  targetStatus: string | string[];
}

export default function SlaWidget({ title, monitorias, users, targetStatus }: SlaWidgetProps) {
  const getName = (id: string) => users.find(u => u.id === id)?.name || id;

  const statuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];
  
  // Filter monitorias by target status and sort by oldest first (closest to deadline)
  const pending = monitorias
    .filter(m => statuses.includes(m.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="bg-white rounded-3xl border border-[#E2E4D8] p-6 shadow-sm flex flex-col h-full">
      <div className="flex items-center gap-2 mb-5">
        <Clock className="w-5 h-5 text-amber-500" />
        <h3 className="font-bold text-[#2D3A3A] text-lg">{title}</h3>
      </div>
      
      <div className="space-y-3 flex-1">
        {pending.length > 0 ? pending.map((m) => {
          // Calculate days pending
          const days = Math.floor((new Date().getTime() - new Date(m.created_at).getTime()) / (1000 * 3600 * 24));
          const isCritical = days >= 2; // Assuming 48h SLA

          return (
            <div key={m.id} className="flex items-center justify-between p-3 rounded-2xl border border-[#F0F1E8] hover:bg-[#F9F9F6] transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-xs font-bold text-[#2D3A3A]">#{m.ticket_id}</span>
                  {isCritical && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                </div>
                <p className="text-[10px] text-[#7A7D71] truncate">
                  {m.status === 'pendente_revisao' ? `Avaliador: ${getName(m.evaluator_id)}` : `Agente: ${getName(m.evaluated_id)}`}
                </p>
              </div>
              <div className="text-right ml-3">
                <span className={`text-xs font-bold ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>
                  {days === 0 ? 'Hoje' : `Há ${days} dia${days > 1 ? 's' : ''}`}
                </span>
              </div>
            </div>
          );
        }) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-[#7A7D71] py-8">
            <Clock className="w-8 h-8 text-[#E2E4D8] mb-2" />
            <p className="text-sm">Nenhuma pendência crítica</p>
          </div>
        )}
      </div>
    </div>
  );
}
