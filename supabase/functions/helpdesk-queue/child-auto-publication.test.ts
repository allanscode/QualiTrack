import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { processChildAutoPublication } from './child-auto-publication.ts';
import { CHILD_TICKET_FORM_ID } from './child-publication.ts';
import { CHILD_AUDITED_TAG } from './queue-search.ts';

const work = { monitoria_id: 'monitoria-child-1', ticket_id: '171437', lease_id: 'lease-child-1' };
const monitoria = {
  id: work.monitoria_id, ticket_id: work.ticket_id, form_id: CHILD_TICKET_FORM_ID,
  score: 53, status: 'concluida', active: true, evaluator_id: 'auditor-1',
  evaluator_note: 'Registro completo',
  form_snapshot: { automation: 'child_ticket', child_ai_evaluation: { status: 'conforme' } },
};
const config: Record<string, string> = {
  ZENDESK_SUBDOMAIN: 'example', ZENDESK_EMAIL: 'agent@example.test', ZENDESK_API_TOKEN: 'token',
  HELPDESK_CHILD_VIEW_ID: '101', HELPDESK_INVALID_CHILD_VIEW_ID: '102',
};
const env = (key: string) => config[key];
const fields = [
  { id: 47141676348180, value: 'positiva' },
  { id: 47422901459476, value: true },
];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function database() {
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'claim_child_auto_publication' ? [work] : null,
    error: null,
  }));
  const updates: Array<{ table: string; payload: unknown }> = [];
  const from = vi.fn((table: string) => {
    let selection = '';
    const builder = {
      select: (columns: string) => { selection = columns; return builder; },
      eq: () => builder, in: () => builder, order: () => builder, limit: () => builder,
      maybeSingle: async () => ({ data: selection === 'id' ? { id: monitoria.id } : monitoria, error: null }),
      update: (payload: unknown) => { updates.push({ table, payload }); return builder; },
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: table === 'queue_ticket_catalog'
          ? [{ queue_type: 'filhos', ticket_snapshot: { id: work.ticket_id } }] : null, error: null }).then(resolve),
    };
    return builder;
  });
  return { db: { rpc, from } as unknown as SupabaseClient, rpc, updates };
}

describe('automatic child publication', () => {
  it('publishes a Conforme verdict below 75 with the official fields and queue exit tag', async () => {
    const state = database();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/views/')) return json({ view: { conditions: { all: [], any: [] } } });
      if (url.includes('/comments.json')) return json({ comments: [] });
      if (init?.method === 'PUT') {
        const payload = JSON.parse(String(init.body));
        if (payload.ticket.comment) {
          return json({ ticket: { updated_at: '2026-10-08T11:00:01Z', tags: ['existe_ticket_filho'], custom_fields: fields } });
        }
        return json({ ticket: { updated_at: '2026-10-08T11:00:02Z', tags: ['existe_ticket_filho', CHILD_AUDITED_TAG], custom_fields: fields } });
      }
      return json({ ticket: { status: 'solved', tags: ['existe_ticket_filho'], updated_at: '2026-10-08T11:00:00Z', custom_fields: [] } });
    });

    expect(await processChildAutoPublication(state.db, env, fetcher))
      .toEqual({ processed: 1, status: 'sent', ticket_id: work.ticket_id });
    const ticketWrites = fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT'
      && String(init?.body).includes('"ticket"')).map(([, init]) => JSON.parse(String(init!.body)).ticket);
    expect(ticketWrites).toHaveLength(2);
    expect(ticketWrites[0].comment).toMatchObject({ public: false, body: expect.stringContaining('Registro completo') });
    expect(ticketWrites[0].custom_fields).toEqual(fields);
    expect(ticketWrites[1]).toMatchObject({ tags: ['existe_ticket_filho', CHILD_AUDITED_TAG] });
    expect(ticketWrites[1].comment).toBeUndefined();
    expect(state.updates).toContainEqual({ table: 'queue_ticket_catalog', payload: {
      ticket_snapshot: { id: work.ticket_id, tags: ['existe_ticket_filho', CHILD_AUDITED_TAG] },
    } });
    expect(state.rpc).toHaveBeenCalledWith('finish_child_auto_publication', expect.objectContaining({ p_status: 'sent' }));
  });

  it('keeps a completed monitoria but skips the macro for a closed ticket', async () => {
    const state = database();
    const fetcher = vi.fn(async () => json({ ticket: {
      status: 'closed', tags: ['existe_ticket_filho'], updated_at: '2026-10-08T11:00:00Z',
    } }));

    expect(await processChildAutoPublication(state.db, env, fetcher))
      .toEqual({ processed: 1, status: 'skipped', ticket_id: work.ticket_id });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.updates).toHaveLength(0);
    expect(state.rpc).toHaveBeenCalledWith('finish_child_auto_publication', expect.objectContaining({ p_status: 'skipped' }));
  });
});
