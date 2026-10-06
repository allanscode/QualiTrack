import { describe, expect, it } from 'vitest';
import { attachQueuePublicationState, type QueueMonitoriaState } from './queue-publication';

const monitoria = (id: string, ticket_id: string, status = 'concluida'): QueueMonitoriaState => ({
  id, ticket_id, status, score: 82, active: true, created_at: '2026-10-06T12:00:00Z',
});

describe('estado de publicação nas filas Zendesk', () => {
  it('mantém negativa monitorada até existir recibo de envio', () => {
    const ticket = { ticket_id: '178984' };
    expect(attachQueuePublicationState([ticket], 'negativas', [monitoria('m1', ticket.ticket_id)], new Set()))
      .toEqual([{ ...ticket, already_audited: true, monitoria_id: 'm1', monitoria_status: 'concluida', monitoria_score: 82 }]);
    expect(attachQueuePublicationState([ticket], 'negativas', [monitoria('m1', ticket.ticket_id)], new Set([ticket.ticket_id])))
      .toEqual([]);
  });

  it('não confunde monitoria de chamado filho com publicação da macro do filho', () => {
    const ticket = { ticket_id: '178943' };
    expect(attachQueuePublicationState([ticket], 'filhos', [monitoria('m2', ticket.ticket_id)], new Set()))
      .toHaveLength(1);
    expect(attachQueuePublicationState([ticket], 'filhos_invalidos', [monitoria('m2', ticket.ticket_id)], new Set()))
      .toHaveLength(1);
    expect(attachQueuePublicationState([ticket], 'positivas', [monitoria('m2', ticket.ticket_id)], new Set()))
      .toEqual([]);
  });

  it('escolhe a monitoria ativa mais recente para revisão', () => {
    const older = monitoria('old', '179150', 'pendente_revisao');
    older.created_at = '2026-10-05T12:00:00Z';
    const inactive = monitoria('inactive', '179150');
    inactive.active = false;
    inactive.created_at = '2026-10-07T12:00:00Z';
    const result = attachQueuePublicationState([{ ticket_id: '179150' }], 'negativas',
      [older, monitoria('new', '179150'), inactive], new Set());
    expect(result[0].monitoria_id).toBe('new');
  });
});
