import type { QueueType } from './access.ts';

export interface QueueMonitoriaState {
  id: string;
  ticket_id: string;
  status: string;
  score: number | null;
  active: boolean | null;
  created_at: string;
}

export interface QueuePublicationTicket {
  ticket_id: string;
  already_audited?: boolean;
  monitoria_id?: string;
  monitoria_status?: string;
  monitoria_score?: number | null;
}

/** Mantém na fila negativa a monitoria sem recibo de envio, inclusive após a decisão final. */
export function attachQueuePublicationState<T extends QueuePublicationTicket>(
  tickets: T[],
  queue: QueueType,
  monitorias: QueueMonitoriaState[],
  sentTicketIds: ReadonlySet<string>,
): T[] {
  const latestByTicket = new Map<string, QueueMonitoriaState>();
  for (const monitoria of monitorias) {
    if (monitoria.active === false) continue;
    const latest = latestByTicket.get(monitoria.ticket_id);
    if (!latest || monitoria.created_at > latest.created_at) latestByTicket.set(monitoria.ticket_id, monitoria);
  }
  return tickets.flatMap(ticket => {
    const monitoria = latestByTicket.get(ticket.ticket_id);
    if (queue === 'negativas' && sentTicketIds.has(ticket.ticket_id)) return [];
    if (queue !== 'negativas' && queue !== 'filhos' && queue !== 'filhos_invalidos' && monitoria) return [];
    return [{
      ...ticket,
      already_audited: Boolean(monitoria),
      ...(monitoria ? {
        monitoria_id: monitoria.id,
        monitoria_status: monitoria.status,
        monitoria_score: monitoria.score,
      } : {}),
    }];
  });
}
