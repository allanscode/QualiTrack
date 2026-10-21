import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { processChildAutoPublication } from './child-auto-publication.ts';
import { CHILD_TICKET_FORM_ID } from './child-publication.ts';
import { CHILD_AUDITED_TAG } from './queue-search.ts';

const work = { monitoria_id: 'monitoria-child-1', ticket_id: '171437', lease_id: 'lease-child-1' };
const monitoria = {
  id: work.monitoria_id, ticket_id: work.ticket_id, form_id: CHILD_TICKET_FORM_ID,
  score: null, child_verdict: 'valido', status: 'concluida', active: true, evaluator_id: 'auditor-1',
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

function database(rowOverride: Record<string, unknown> = {}) {
  const activeMonitoria = { ...monitoria, ...rowOverride };
  const activeWork = { ...work, monitoria_id: String(activeMonitoria.id), ticket_id: String(activeMonitoria.ticket_id) };
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'claim_child_auto_publication' ? [activeWork] : null,
    error: null,
  }));
  const updates: Array<{ table: string; payload: unknown }> = [];
  const from = vi.fn((table: string) => {
    let selection = '';
    const builder = {
      select: (columns: string) => { selection = columns; return builder; },
      eq: () => builder, in: () => builder, order: () => builder, limit: () => builder,
      maybeSingle: async () => ({ data: selection === 'id' ? { id: activeMonitoria.id } : activeMonitoria, error: null }),
      update: (payload: unknown) => { updates.push({ table, payload }); return builder; },
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: table === 'queue_ticket_catalog'
          ? [{ queue_type: 'filhos', ticket_snapshot: { id: activeWork.ticket_id } }] : null, error: null }).then(resolve),
    };
    return builder;
  });
  return { db: { rpc, from } as unknown as SupabaseClient, rpc, updates };
}

describe('automatic child publication', () => {
  it('publishes a Conforme verdict below 75 with the official fields and queue exit tag', async () => {
    const state = database();
    let posted = false;
    let tagged = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/views/')) return json({ view: { conditions: { all: [], any: [] } } });
      if (url.includes('/comments.json')) return json({ comments: posted
        ? [{ body: `[QualidadeWP · Chamado filho VÁLIDO]\n\nRegistro do Auditor da monitoria #${monitoria.id}: Registro completo` }] : [] });
      if (init?.method === 'PUT') {
        const payload = JSON.parse(String(init.body));
        if (payload.ticket.comment) {
          posted = true;
          return json({ ticket: { updated_at: '2026-10-08T11:00:01Z', tags: ['existe_ticket_filho','positiva','analisado_qa',CHILD_AUDITED_TAG], custom_fields: fields } });
        }
        tagged = true;
        return json({ ticket: { updated_at: '2026-10-08T11:00:02Z', tags: ['existe_ticket_filho','positiva','analisado_qa',CHILD_AUDITED_TAG], custom_fields: fields } });
      }
      return json({ ticket: { status: 'solved', tags: ['existe_ticket_filho','positiva','analisado_qa',CHILD_AUDITED_TAG], updated_at: '2026-10-08T11:00:00Z', custom_fields: posted ? fields : [] } });
    });

    expect(await processChildAutoPublication(state.db, env, fetcher))
      .toEqual({ processed: 1, status: 'sent', ticket_id: work.ticket_id });
    const ticketWrites = fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT'
      && String(init?.body).includes('"ticket"')).map(([, init]) => JSON.parse(String(init!.body)).ticket);
    expect(ticketWrites).toHaveLength(1);
    expect(ticketWrites[0].comment).toMatchObject({ public: false, body: expect.stringContaining('Registro completo') });
    expect(ticketWrites[0].custom_fields).toEqual(fields);
    expect(ticketWrites[0]).toMatchObject({ tags: ['existe_ticket_filho','positiva','analisado_qa',CHILD_AUDITED_TAG] });
    expect(state.updates).toContainEqual({ table: 'queue_ticket_catalog', payload: {
      ticket_snapshot: { id: work.ticket_id, tags: ['existe_ticket_filho','positiva','analisado_qa',CHILD_AUDITED_TAG] },
    } });
    expect(state.rpc).toHaveBeenCalledWith('finish_child_auto_publication', expect.objectContaining({ p_status: 'sent' }));
  });

  it('publishes an invalid child macro when a human child monitoria below 75 concludes after review/deadline', async () => {
    const invalidFields = [
      { id: 47141676348180, value: 'negativa' },
      { id: 47422901459476, value: true },
      { id: 47850817758484, value: 'critico' },
    ];
    const state = database({
      id: '5db70d8a-77fc-4dea-940a-e6eaf9b822c8',
      ticket_id: '179157',
      score: 0,
      child_verdict: 'invalido',
      status: 'concluida',
      evaluator_note: 'Chamado filho reprovado após revisão.',
      form_snapshot: { ticket_kind: 'chamado_filho' },
    });
    let posted = false;
    let tagged = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/views/')) return json({ view: { conditions: { all: [], any: [] } } });
      if (url.includes('/comments.json')) return json({ comments: posted
        ? [{ body: '[QualidadeWP · Chamado filho INVÁLIDO]\n\nRegistro do Auditor da monitoria #5db70d8a-77fc-4dea-940a-e6eaf9b822c8:' }] : [] });
      if (init?.method === 'PUT') {
        const payload = JSON.parse(String(init.body));
        if (payload.ticket.comment) {
          posted = true;
          return json({ ticket: { updated_at: '2026-10-19T17:10:01Z', tags: ['ticket_filho','negativa','analisado_qa',CHILD_AUDITED_TAG], custom_fields: invalidFields } });
        }
        tagged = true;
        return json({ ticket: { updated_at: '2026-10-19T17:10:02Z', tags: ['ticket_filho','negativa','analisado_qa',CHILD_AUDITED_TAG], custom_fields: invalidFields } });
      }
      return json({ ticket: { status: 'solved', tags: ['ticket_filho','negativa','analisado_qa',CHILD_AUDITED_TAG], updated_at: '2026-10-19T17:10:00Z', custom_fields: posted ? invalidFields : [] } });
    });

    expect(await processChildAutoPublication(state.db, env, fetcher))
      .toEqual({ processed: 1, status: 'sent', ticket_id: '179157' });
    const ticketWrites = fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT'
      && String(init?.body).includes('"ticket"')).map(([, init]) => JSON.parse(String(init!.body)).ticket);
    expect(ticketWrites).toHaveLength(1);
    expect(ticketWrites[0].comment.body).toContain('[QualidadeWP · Chamado filho INVÁLIDO]');
    expect(ticketWrites[0].comment.body).toContain('Chamado filho inválido.');
    expect(ticketWrites[0].comment.body).toContain('Registro do Auditor da monitoria #5db70d8a-77fc-4dea-940a-e6eaf9b822c8:');
    expect(ticketWrites[0].custom_fields).toEqual(invalidFields);
    expect(ticketWrites[0].tags).toEqual(['ticket_filho','negativa','analisado_qa',CHILD_AUDITED_TAG]);
  });

  it('updates custom_fields and exit tag directly on a closed child ticket without sending a comment', async () => {
    const state = database();
    let fieldsApplied = false;
    let tagged = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/views/')) return json({ view: { conditions: { all: [], any: [] } } });
      if (init?.method === 'PUT') {
        const payload = JSON.parse(String(init.body));
        expect(payload.ticket.comment).toBeUndefined();
        if (payload.ticket.custom_fields) {
          fieldsApplied = true;
          return json({ ticket: { status: 'closed', updated_at: '2026-10-08T11:00:01Z', tags: ['existe_ticket_filho','positiva','analisado_qa',CHILD_AUDITED_TAG], custom_fields: fields } });
        }
        tagged = true;
        return json({ ticket: { status: 'closed', updated_at: '2026-10-08T11:00:02Z', tags: ['existe_ticket_filho','positiva','analisado_qa',CHILD_AUDITED_TAG], custom_fields: fields } });
      }
      return json({ ticket: {
        status: 'closed',
        tags: ['existe_ticket_filho','positiva','analisado_qa',CHILD_AUDITED_TAG],
        updated_at: '2026-10-08T11:00:00Z',
        custom_fields: fieldsApplied ? fields : [],
      } });
    });

    expect(await processChildAutoPublication(state.db, env, fetcher))
      .toEqual({ processed: 1, status: 'sent', ticket_id: work.ticket_id });
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(state.updates).toContainEqual({ table: 'queue_ticket_catalog', payload: {
      ticket_snapshot: { id: work.ticket_id, tags: ['existe_ticket_filho','positiva','analisado_qa',CHILD_AUDITED_TAG] },
    } });
    expect(state.rpc).toHaveBeenCalledWith('finish_child_auto_publication', expect.objectContaining({ p_status: 'sent' }));
  });
});
