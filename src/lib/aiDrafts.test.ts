// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAIDraft, fetchAIDrafts, fetchOpenAIDrafts, saveAIDraft } from './aiDrafts';

vi.mock('./supabase', () => ({ isMockMode: true, supabase: null }));

describe('rascunhos de IA na fila', () => {
  beforeEach(() => localStorage.clear());

  it('mantém o ticket e o resultado após uma nova leitura da fila e remove após lançamento', async () => {
    const ticket = {
      ticket_id: '123', subject: 'Ticket proativo', csat_status: 'unrated' as const,
      ticket_date: '2026-09-28', status: 'open',
    };
    await saveAIDraft({
      ticketId: ticket.ticket_id, sourceQueue: 'proativas', ticketSnapshot: ticket,
      result: { score: 90, summary: 'Avaliação pronta', answers: {} } as never,
      guidelineIds: [],
    });

    const retained = await fetchOpenAIDrafts('proativas');
    expect(retained).toHaveLength(1);
    expect(retained[0].ticket_snapshot).toEqual(ticket);
    expect((await fetchAIDrafts(['123']))['123']?.result.summary).toBe('Avaliação pronta');
    expect(await fetchOpenAIDrafts('positivas')).toEqual([]);

    await deleteAIDraft('123');
    expect(await fetchOpenAIDrafts('proativas')).toEqual([]);
  });

  it('recupera rascunhos antigos sem origem na fila Proativas', async () => {
    await saveAIDraft({ ticketId: '999', result: { summary: 'Legado' } as never, guidelineIds: [] });
    expect((await fetchOpenAIDrafts('proativas')).map(draft => draft.ticket_id)).toEqual(['999']);
    expect(await fetchOpenAIDrafts('negativas')).toEqual([]);
  });
});
