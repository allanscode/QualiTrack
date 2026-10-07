import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchQueueAssignments } from './queueDistribution';

const database = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), result: vi.fn() }));
vi.mock('./supabase', () => ({ isMockMode: false, supabase: database }));

describe('atribuição das revisões de filhos retidas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.rpc.mockResolvedValue({ error: null });
    database.result.mockResolvedValue({ data: [{ ticket_id: '777', assigned_to: 'monitor', status: 'pending' }], error: null });
    database.from.mockReturnValue({ select: () => ({ eq: () => ({ in: database.result }) }) });
  });
  it('prepara as revisões autorizadas antes de buscar o responsável', async () => {
    const assignments = await fetchQueueAssignments('filhos', ['777'], true);
    expect(database.rpc).toHaveBeenCalledWith('assign_retained_child_ai_tickets');
    expect(database.rpc.mock.invocationCallOrder[0]).toBeLessThan(database.from.mock.invocationCallOrder[0]);
    expect(assignments['777'].assigned_to).toBe('monitor');
  });
  it('consulta sem distribuição quando a tela é somente de leitura', async () => {
    await fetchQueueAssignments('filhos', ['777']);
    expect(database.rpc).not.toHaveBeenCalled();
  });
  it('não oculta falhas de autorização para abrir uma ficha sem responsável', async () => {
    database.rpc.mockResolvedValue({ error: { message: 'Acesso negado' } });
    await expect(fetchQueueAssignments('filhos', ['777'], true)).rejects.toThrow('Acesso negado');
    expect(database.from).not.toHaveBeenCalled();
  });
});
