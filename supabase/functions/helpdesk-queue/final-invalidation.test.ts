import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { processFinalPositiveInvalidation } from './final-invalidation';
import { childMacroCustomFields } from './child-macro-fields';

const envValues: Record<string, string> = {
  ZENDESK_FINAL_SYNC_ENABLED: 'true', ZENDESK_SUBDOMAIN: 'example',
  ZENDESK_EMAIL: 'worker@example.invalid', ZENDESK_API_TOKEN: 'fake',
};
const env = (key: string) => envValues[key];
const fields = childMacroCustomFields('nao_conforme');
const ticket = { id: 123, status: 'solved', updated_at: '2026-10-07T12:00:00Z', custom_fields: [] };
const monitoria = {
  id: 'monitoria', ticket_id: '123', active: true, status: 'concluida', score: 0,
  satisfaction_result: 'Positiva', evaluator_note: 'Erro crítico confirmado na solução.',
  satisfaction_has_record: true, satisfaction_record_text: 'Cliente elogiou o atendimento.',
};
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function database(authorized = true, note = monitoria.evaluator_note, manualSent = false) {
  const rpc = vi.fn(async (name: string) => ({ error: null, data: name === 'claim_final_positive_invalidation'
    ? [{ id: 'work', monitoria_id: 'monitoria', ticket_id: '123', lease_id: 'lease' }]
    : name === 'authorize_final_positive_invalidation' ? authorized : true }));
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: { ...monitoria, evaluator_note: note }, error: null })) };
  const receipts = { select: vi.fn(() => receipts), eq: vi.fn(() => receipts),
    limit: vi.fn(() => receipts), maybeSingle: vi.fn(async () => ({ data: manualSent ? { id: 'receipt' } : null, error: null })) };
  return { db: { rpc, from: vi.fn((table: string) => table === 'monitorias' ? query : receipts) } as unknown as SupabaseClient, rpc };
}
const comments = { comments: [] };

describe('final positive invalidation worker', () => {
  it('defaults off before claiming work', async () => {
    const { db, rpc } = database(); const fetcher = vi.fn();
    expect(await processFinalPositiveInvalidation(db, () => undefined, fetcher)).toEqual({ enabled: false, processed: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('publishes the saved auditor record as an internal comment only after final authorization', async () => {
    const { db, rpc } = database();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ ticket }))
      .mockResolvedValueOnce(response(comments))
      .mockResolvedValueOnce(response({ ticket: { ...ticket, custom_fields: fields } }));
    expect(await processFinalPositiveInvalidation(db, env, fetcher)).toMatchObject({ status: 'applied' });
    const payload = JSON.parse(fetcher.mock.calls[2][1].body);
    expect(payload.ticket).toMatchObject({ custom_fields: fields, safe_update: true, updated_stamp: ticket.updated_at });
    expect(payload.ticket.comment).toMatchObject({ public: false, html_body: expect.stringContaining(monitoria.evaluator_note) });
    expect(payload.ticket.comment.html_body).toContain('Registro do Auditor da monitoria #monitoria');
    expect(rpc).toHaveBeenCalledWith('authorize_final_positive_invalidation', { p_id: 'work', p_lease_id: 'lease' });
  });
  it('does not publish before manager decision is final', async () => {
    const { db } = database(false);
    const fetcher = vi.fn().mockResolvedValueOnce(response({ ticket })).mockResolvedValueOnce(response(comments));
    expect(await processFinalPositiveInvalidation(db, env, fetcher)).toMatchObject({ status: 'skipped' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('blocks a missing auditor record without calling Zendesk', async () => {
    const { db } = database(true, '');
    const fetcher = vi.fn();
    expect(await processFinalPositiveInvalidation(db, env, fetcher)).toMatchObject({ status: 'blocked' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('recovers a previously accepted comment without posting it again', async () => {
    const { db } = database();
    const fetcher = vi.fn().mockResolvedValueOnce(response({ ticket: { ...ticket, custom_fields: fields } }))
      .mockResolvedValueOnce(response({ comments: [{ body: 'Registro do Auditor da monitoria #monitoria' }] }));
    expect(await processFinalPositiveInvalidation(db, env, fetcher)).toMatchObject({ status: 'applied' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('checks later comment pages before posting again', async () => {
    const { db } = database();
    const next = 'https://example.zendesk.com/api/v2/tickets/123/comments.json?page=2';
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ ticket: { ...ticket, custom_fields: fields } }))
      .mockResolvedValueOnce(response({ comments: [], next_page: next }))
      .mockResolvedValueOnce(response({ comments: [{ body: 'Registro do Auditor da monitoria #monitoria' }] }));
    expect(await processFinalPositiveInvalidation(db, env, fetcher)).toMatchObject({ status: 'applied' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('uses an existing manual negative publication without adding a second comment', async () => {
    const { db } = database(true, monitoria.evaluator_note, true);
    const fetcher = vi.fn().mockResolvedValueOnce(response({ ticket: { ...ticket, custom_fields: fields } }));
    expect(await processFinalPositiveInvalidation(db, env, fetcher)).toMatchObject({ status: 'applied' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('treats an ambiguous Zendesk write as blocked to avoid duplicate comments', async () => {
    const { db } = database();
    const fetcher = vi.fn().mockResolvedValueOnce(response({ ticket }))
      .mockResolvedValueOnce(response(comments)).mockRejectedValueOnce(new Error('network timeout'));
    expect(await processFinalPositiveInvalidation(db, env, fetcher)).toMatchObject({ status: 'blocked' });
  });
  it('retries a rejected optimistic-lock write after a fresh check', async () => {
    const { db } = database();
    const fetcher = vi.fn().mockResolvedValueOnce(response({ ticket }))
      .mockResolvedValueOnce(response(comments)).mockResolvedValueOnce(response({}, 409));
    expect(await processFinalPositiveInvalidation(db, env, fetcher)).toMatchObject({ status: 'pending' });
  });
});
