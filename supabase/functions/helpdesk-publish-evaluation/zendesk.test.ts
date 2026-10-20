import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZendeskProvider } from './zendesk';

afterEach(() => vi.unstubAllGlobals());

describe('Zendesk publication eligibility', () => {
  it('rejects a closed ticket before attempting to publish', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket: { status: 'closed' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new ZendeskProvider({ subdomain: 'example', email: 'agent@example.com', apiToken: 'test' });

    const result = await provider.checkPublicationEligibility('123');

    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/fechado/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/tickets/123.json');
  });

  it('allows a solved ticket to continue to publication', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket: { status: 'solved' } }), { status: 200 })));
    const provider = new ZendeskProvider({ subdomain: 'example', email: 'agent@example.com', apiToken: 'test' });

    expect(await provider.checkPublicationEligibility('456')).toEqual({ eligible: true });
  });
});

describe('confirmação dos campos da macro', () => {
  const provider = new ZendeskProvider({ subdomain: 'example', email: 'agent@example.com', apiToken: 'test' });
  const fields = [
    { id: 47141676348180, value: 'positiva' },
    { id: 47422901459476, value: true },
  ];

  it('remove a marca crítica anterior quando a decisão final valida o ticket', async () => {
    const finalFields = [...fields, { id: 47850817758484, value: null }];
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes('/comments.json') ? { comments: [{ id: 92, public: false, body: 'Decisão final' }] }
        : { ticket: { custom_fields: finalFields }, audit: { events: [{ type: 'Comment', id: 92 }] } },
    ), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await provider.publishEvaluation({ ticketId: '180210', outcome: 'positiva',
      htmlBody: '<p>Decisão final</p>', clearPreviousInvalid: true });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.ticket.custom_fields).toEqual(finalFields);
  });

  it('corrige somente os campos quando o primeiro PUT já publicou o comentário', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ticket: { updated_at: '2026-10-06T10:00:00Z', custom_fields: [] },
        audit: { events: [{ type: 'Comment', id: 91 }] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: { custom_fields: fields } }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ticket: { custom_fields: fields } }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ comments: [{ id: 91, public: false, body: 'Teste' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await provider.publishEvaluation({ ticketId: '178984', outcome: 'positiva', htmlBody: '<p>Teste</p>' }))
      .toEqual({ externalCommentId: '91' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const repair = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(repair.ticket.comment).toBeUndefined();
    expect(repair.ticket.custom_fields).toEqual(fields);
    expect(repair.ticket.safe_update).toBe(true);
  });

  it('não registra sucesso se o Zendesk continuar ignorando os campos', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: { updated_at: '2026-10-06T10:00:00Z', custom_fields: [] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: { custom_fields: [] } }), { status: 200 })));
    await expect(provider.publishEvaluation({ ticketId: '178984', outcome: 'positiva', htmlBody: '<p>Teste</p>' }))
      .rejects.toThrow(/não confirmou os campos/i);
  });

  it('updates custom_fields directly on a closed ticket when automatic delivery runs', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body ? String(init.body) : undefined });
      return new Response(JSON.stringify({
        ticket: { status: 'closed', custom_fields: fields },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await provider.checkPublicationEligibility('123', { allowFollowUp: true })).toEqual({ eligible: true });
    expect(await provider.publishEvaluation({
      ticketId: '123', outcome: 'positiva', allowFollowUp: true,
      htmlBody: '<p>Monitoria QWP #11111111-1111-1111-1111-111111111111</p>',
    })).toEqual({ externalCommentId: 'closed-fields:123' });
    const puts = calls.filter(call => call.method === 'PUT');
    expect(puts).toHaveLength(1);
    const sent = JSON.parse(puts[0].body!);
    expect(sent.ticket.comment).toBeUndefined();
    expect(sent.ticket.custom_fields).toEqual(fields);
    expect(calls.filter(call => call.method === 'POST')).toHaveLength(0);
  });
});
