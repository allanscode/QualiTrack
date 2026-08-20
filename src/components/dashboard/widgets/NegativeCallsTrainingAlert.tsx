import React, { useMemo } from 'react';
import { AlertTriangle, UserRound } from 'lucide-react';
import { Monitoria, User } from '../../../types';
import Card from '../../ui/Card';

const NEGATIVE_CALL_THRESHOLD = 5;
const WINDOW_DAYS = 90;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface NegativeCallsTrainingAlertProps {
  monitorias: Monitoria[];
  users: User[];
  teamIds: string[];
  isCustomizing?: boolean;
}

interface TrainingAlertAgent {
  id: string;
  name: string;
  count: number;
}

function getMonitoriaDate(monitoria: Monitoria): number | null {
  const dateValue = monitoria.ticket_date || monitoria.created_at;
  if (!dateValue) return null;
  const timestamp = new Date(dateValue).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export default function NegativeCallsTrainingAlert({
  monitorias,
  users,
  teamIds,
  isCustomizing = false
}: NegativeCallsTrainingAlertProps) {
  const agents = useMemo<TrainingAlertAgent[]>(() => {
    if (isCustomizing) return [];

    const cutoff = Date.now() - WINDOW_DAYS * DAY_IN_MS;
    const counts = new Map<string, number>();

    monitorias.forEach((monitoria) => {
      const isValidatedNegative = monitoria.satisfaction_result === 'Negativa'
        && monitoria.status === 'concluida'
        && monitoria.active !== false;
      const isManagerTeam = Boolean(monitoria.team_id && teamIds.includes(monitoria.team_id));
      const date = getMonitoriaDate(monitoria);

      if (isValidatedNegative && isManagerTeam && monitoria.evaluated_id && date !== null && date >= cutoff) {
        counts.set(monitoria.evaluated_id, (counts.get(monitoria.evaluated_id) || 0) + 1);
      }
    });

    return Array.from(counts.entries())
      .filter(([, count]) => count >= NEGATIVE_CALL_THRESHOLD)
      .map(([id, count]) => ({
        id,
        count,
        name: users.find((user) => user.id === id)?.name || 'Agente não identificado'
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [isCustomizing, monitorias, teamIds, users]);

  return (
    <Card padding="md" className="border-functional-warning/40 bg-functional-warning/5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-functional-warning/15 text-functional-warning flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-brand-primary">
            Necessidade de treinamento
          </h3>
          <p className="text-[10px] text-brand-muted font-semibold mt-0.5">
            Chamados negativos validados nos últimos 90 dias
          </p>
        </div>
        {agents.length > 0 && (
          <span className="ml-auto inline-flex items-center rounded-lg bg-functional-warning/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-functional-warning">
            {agents.length} {agents.length === 1 ? 'agente' : 'agentes'}
          </span>
        )}
      </div>

      {agents.length === 0 ? (
        <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted opacity-70">
          Nenhum agente atingiu 5 chamados negativos validados
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {agents.map((agent) => (
            <div key={agent.id} className="flex items-center justify-between gap-3 rounded-xl border border-functional-warning/20 bg-surface-card/70 px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <UserRound className="w-4 h-4 text-functional-warning flex-shrink-0" />
                <span className="text-xs font-bold text-brand-primary truncate">{agent.name}</span>
              </div>
              <span className="flex-shrink-0 rounded-md bg-functional-warning/15 px-2 py-1 text-[10px] font-black text-functional-warning">
                {agent.count} chamados
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
