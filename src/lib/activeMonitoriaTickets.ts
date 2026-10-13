import type { Monitoria } from '../types';

/** Removed monitorias remain in history but must not hide tickets from the queue. */
export function activeMonitoriaTicketIds(monitorias: Pick<Monitoria, 'ticket_id' | 'active'>[]): Set<string> {
  return new Set(monitorias
    .filter(monitoria => monitoria.active !== false)
    .map(monitoria => monitoria.ticket_id?.trim())
    .filter((ticketId): ticketId is string => Boolean(ticketId)));
}
