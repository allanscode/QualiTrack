import type { AuditingQueueType, AuditingQueueTicket } from '../types';
export function getMockQueueTickets(_type: AuditingQueueType, _auditedIds: Set<string>): AuditingQueueTicket[] {
  throw new Error('Fila demonstrativa indisponível em produção.');
}
