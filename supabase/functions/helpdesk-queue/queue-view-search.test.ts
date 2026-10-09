import { describe, expect, it } from 'vitest';
import { collectViewSearchPage, ticketMatchesViewSearch } from './queue-view-search';

describe('busca na view proativa', () => {
  it('localiza o nome do atendente com ou sem acento e mantém ID exato', () => {
    const users = new Map([[7, { id: 7, name: 'Átila Lima Pereira' }]]);
    const ticket = { id: 181956, subject: 'Dúvida sobre o relatório', assignee_id: 7 };
    expect(ticketMatchesViewSearch(ticket, users, 'atila lima')).toBe(true);
    expect(ticketMatchesViewSearch(ticket, users, 'relatorio')).toBe(true);
    expect(ticketMatchesViewSearch(ticket, users, '#181956')).toBe(true);
    expect(ticketMatchesViewSearch(ticket, users, '18195')).toBe(false);
  });

  it('procura nas páginas reais da view até encontrar o agente sem misturar outros tickets', async () => {
    const calls: string[] = [];
    const pages = {
      first: {
        tickets: [{ id: 101, subject: 'Outro caso', assignee_id: 1 }],
        users: [{ id: 1, name: 'Outro Agente' }],
        groups: [{ id: 10 }], organizations: [{ id: 20 }],
        meta: { has_more: true }, links: { next: 'second' },
      },
      second: {
        tickets: [{ id: 102, subject: 'Pedido de análise', assignee_id: 2 }],
        users: [{ id: 2, name: 'Márcio Silva' }],
        groups: [{ id: 11 }], organizations: [{ id: 21 }],
        meta: { has_more: false }, links: { next: null },
      },
    };
    const found = await collectViewSearchPage({
      initialUrl: 'first', term: 'marcio', pageSize: 1,
      fetchPage: async url => { calls.push(url); return pages[url as keyof typeof pages]; },
      validateNext: url => url,
    });
    expect(calls).toEqual(['first', 'second']);
    expect(found.tickets.map(ticket => ticket.id)).toEqual([102]);
    expect(found.users.map(user => user.name)).toContain('Márcio Silva');
    expect(found.hasMore).toBe(false);
  });

  it('preserva o cursor da view depois de preencher a página de resultados', async () => {
    const found = await collectViewSearchPage({
      initialUrl: 'first', term: 'Ana', pageSize: 1,
      fetchPage: async () => ({
        tickets: [{ id: 200, assignee_id: 5 }], users: [{ id: 5, name: 'Ana Lima' }],
        groups: [], organizations: [], meta: { has_more: true }, links: { next: 'second' },
      }),
      validateNext: url => url,
    });
    expect(found.tickets).toHaveLength(1);
    expect(found.nextCursor).toBe('second');
    expect(found.hasMore).toBe(true);
  });
});
