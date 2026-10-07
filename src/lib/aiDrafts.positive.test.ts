import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOpenAIDrafts } from './aiDrafts';

const database = vi.hoisted(() => ({
  from: vi.fn(), invoke: vi.fn(), range: vi.fn(),
}));
vi.mock('./supabase', () => ({
  isMockMode: false,
  supabase: { from: database.from, functions: { invoke: database.invoke } },
}));

describe('revisões positivas persistidas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), range: database.range,
    };
    database.from.mockReturnValue(query);
  });

  it.each(['positivas', 'filhos'] as const)('recupera tickets %s fechados e sem snapshot sem depender do Zendesk', async queue => {
    database.range.mockResolvedValue({ data: [
      { ticket_id: '10', source_queue: queue, ticket_snapshot: { status: 'closed' } },
      { ticket_id: '11', source_queue: queue, ticket_snapshot: null },
    ], error: null });
    database.invoke.mockRejectedValue(new Error('Zendesk indisponível'));
    expect((await fetchOpenAIDrafts(queue)).map(draft => draft.ticket_id)).toEqual(['10', '11']);
    expect(database.invoke).not.toHaveBeenCalled();
  });

  it('propaga falhas do banco para não apresentar uma fila vazia como válida', async () => {
    database.range.mockResolvedValue({ data: null, error: { message: 'Sem conexão' } });
    await expect(fetchOpenAIDrafts('positivas')).rejects.toThrow('Sem conexão');
  });
});
