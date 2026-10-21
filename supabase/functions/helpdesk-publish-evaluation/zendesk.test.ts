import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZendeskProvider } from './zendesk';

afterEach(() => vi.unstubAllGlobals());

describe('Zendesk publication eligibility', () => {
  it('rejects a closed ticket for the interactive eligibility check', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket: { status: 'closed' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new ZendeskProvider({ subdomain: 'example', email: 'agent@example.com', apiToken: 'test' });
    const result = await provider.checkPublicationEligibility('123');
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/fechado/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Zendesk final verdict publication', () => {
  const provider = new ZendeskProvider({ subdomain: 'example', email: 'agent@example.com', apiToken: 'test' });
  const fields = [
    { id: 47141676348180, value: 'positiva' },
    { id: 47422901459476, value: true },
    { id: 47850817758484, value: null },
  ];
  const baseFields = fields.slice(0, 2);
  const tags = ['positiva', 'analisado_qa'];
  const response = (ticket: unknown, extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ ticket, ...extra }), { status: 200 });

  it('synchronizes fields and verdict tags and clears a previous critical flag', async () => {
    const sent: Array<Record<string, any>> = [];
    let writes = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/comments.json')) return new Response(JSON.stringify({ comments: [{ id: 92, public: false, body: 'Final verdict' }] }), { status: 200 });
      if (init?.method === 'PUT') {
        sent.push(JSON.parse(String(init.body)).ticket);
        writes++;
        return response({ status: 'solved', updated_at: '2026-10-06T10:00:01Z', custom_fields: fields, tags }, { audit: { events: [{ type: 'Comment', id: 92 }] } });
      }
      return response(writes ? { status: 'solved', updated_at: '2026-10-06T10:00:01Z', custom_fields: fields, tags }
        : { status: 'solved', updated_at: '2026-10-06T10:00:00Z', custom_fields: [{ id: 47141676348180, value: 'negativa' }, { id: 47850817758484, value: 'critico' }], tags: ['negativa', 'analisado_qa'] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await provider.publishEvaluation({ ticketId: '180210', outcome: 'positiva', htmlBody: '<p>Final verdict</p>', clearPreviousInvalid: true });

    expect(sent).toHaveLength(1);
    expect(sent[0].custom_fields).toEqual(fields);
    expect(sent[0].tags).toEqual(tags);
  });

  it('repairs fields without duplicating a private comment and retains other tags', async () => {
    let writes = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/comments.json')) return new Response(JSON.stringify({ comments: [{ id: 91, public: false, body: 'Test' }] }), { status: 200 });
      if (init?.method === 'PUT') {
        writes++;
        const ticket = JSON.parse(String(init.body)).ticket;
        if (writes === 1) return response({ status: 'solved', updated_at: '2026-10-06T10:00:01Z', custom_fields: [], tags: ['legacy_tag', ...tags] }, { audit: { events: [{ type: 'Comment', id: 91 }] } });
        expect(ticket.comment).toBeUndefined();
        expect(ticket.tags).toContain('legacy_tag');
        return response({ status: 'solved', updated_at: '2026-10-06T10:00:02Z', custom_fields: baseFields, tags: ['legacy_tag', ...tags] });
      }
      return response(writes ? { status: 'solved', updated_at: '2026-10-06T10:00:02Z', custom_fields: baseFields, tags: ['legacy_tag', ...tags] }
        : { status: 'solved', updated_at: '2026-10-06T10:00:00Z', custom_fields: [], tags: ['legacy_tag'] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider.publishEvaluation({ ticketId: '178984', outcome: 'positiva', htmlBody: '<p>Test</p>' }))
      .resolves.toMatchObject({ externalCommentId: '91' });
    expect(writes).toBe(2);
  });

  it('updates only fields and tags on closed tickets, preserving their status and comments', async () => {
    const sent: Array<Record<string, any>> = [];
    let writes = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { sent.push(JSON.parse(String(init.body)).ticket); writes++; }
      return response({ status: 'closed', updated_at: `2026-10-06T10:00:0${writes}Z`, custom_fields: baseFields, tags });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider.publishEvaluation({ ticketId: '123', outcome: 'positiva', htmlBody: '<p>Final</p>' }))
      .resolves.toEqual({ externalCommentId: 'closed-fields:123' });
    expect(sent).toHaveLength(1);
    expect(sent[0].comment).toBeUndefined();
    expect(sent[0].custom_fields).toEqual(baseFields);
    expect(sent[0].tags).toEqual(tags);
    expect(sent[0].status).toBeUndefined();
  });
});
