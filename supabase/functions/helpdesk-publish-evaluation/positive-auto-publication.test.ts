import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import type { HelpdeskProvider } from './types.ts';
import { processPositiveAutoPublication } from './positive-auto-publication.ts';

const monitoria = {
  id: 'monitoria-1', ticket_id: '180413', active: true, status: 'concluida', score: 93.75,
  evaluator_id: 'auditor-1', evaluator_note: 'Atendimento correto',
  satisfaction_result: 'Positiva', satisfaction_has_record: true,
  satisfaction_record_text: 'Cliente satisfeito', form_snapshot: { automation: 'positive_csat' },
};
const work = { monitoria_id: monitoria.id, ticket_id: monitoria.ticket_id, lease_id: 'lease-1', source: 'positive_csat' };

function setup(options: {
  publicationClaim?: string | null;
  receiptError?: Error;
  monitoriaError?: Error;
  finalDecision?: boolean;
  lastSentOutcome?: 'positiva' | 'negativa';
  row?: Record<string, unknown>;
  latestId?: string;
} = {}) {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    calls.push({ name, args });
    switch (name) {
      case 'claim_positive_auto_publication': return { data: [{ ...work, source: options.finalDecision ? 'final_decision' : 'positive_csat' }], error: null };
      case 'claim_helpdesk_publication': return { data: options.publicationClaim === undefined ? 'claim-1' : options.publicationClaim, error: null };
      case 'finish_helpdesk_publication': return { data: null, error: options.receiptError ?? null };
      case 'finish_positive_auto_publication': return { data: null, error: null };
      default: throw new Error(`Unexpected RPC: ${name}`);
    }
  });
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query), limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: options.monitoriaError ? null : {
      ...monitoria, form_snapshot: options.finalDecision ? {} : monitoria.form_snapshot,
      ...options.row,
    }, error: options.monitoriaError ?? null })),
  };
  const receiptQuery = {
    select: vi.fn(() => receiptQuery), eq: vi.fn(() => receiptQuery), order: vi.fn(() => receiptQuery), limit: vi.fn(() => receiptQuery),
    maybeSingle: vi.fn(async () => ({ data: options.lastSentOutcome ? { outcome: options.lastSentOutcome } : null, error: null })),
  };
  const from = vi.fn((table: string) => {
    if (table === 'monitorias') return query;
    if (table === 'helpdesk_submissions') return receiptQuery;
    throw new Error(`Unexpected table: ${table}`);
  });
  const provider: HelpdeskProvider = {
    name: 'zendesk',
    checkPublicationEligibility: vi.fn(async () => ({ eligible: true })),
    publishEvaluation: vi.fn(async () => ({ externalCommentId: 'comment-1' })),
  };
  const originalMaybeSingle = query.maybeSingle;
  query.maybeSingle = vi.fn(async () => query.select.mock.calls.at(-1)?.[0] === 'id'
    ? { data: { id: options.latestId ?? monitoria.id }, error: null }
    : originalMaybeSingle());
  return { db: { rpc, from } as unknown as SupabaseClient, provider, rpc, calls, from };
}

function call(calls: Array<{ name: string; args?: Record<string, unknown> }>, name: string) {
  return calls.find(entry => entry.name === name)?.args;
}

describe('positive auto-publication', () => {
  it('publishes once and marks the queue sent only after recording the helpdesk receipt', async () => {
    const state = setup();

    expect(await processPositiveAutoPublication(state.db, state.provider))
      .toEqual({ processed: 1, status: 'sent', ticket_id: work.ticket_id });
    expect(state.provider.checkPublicationEligibility).toHaveBeenCalledWith(work.ticket_id,{allowFollowUp:true});
    expect(state.provider.publishEvaluation).toHaveBeenCalledWith({
      ticketId: work.ticket_id, outcome: 'positiva', htmlBody: expect.stringContaining('Atendimento correto'),
      clearPreviousInvalid: false,
      allowFollowUp: true,
    });
    expect(call(state.calls, 'claim_helpdesk_publication')).toEqual({
      p_monitoria: monitoria.id, p_caller: monitoria.evaluator_id, p_force: false,
    });
    expect(call(state.calls, 'finish_helpdesk_publication')).toMatchObject({
      p_monitoria: monitoria.id, p_claim: 'claim-1', p_ticket: work.ticket_id,
      p_outcome: 'positiva', p_comment: 'comment-1', p_success: true,
    });
    expect(call(state.calls, 'finish_positive_auto_publication')).toMatchObject({
      p_monitoria_id: monitoria.id, p_lease_id: work.lease_id, p_status: 'sent',
    });
    expect(state.calls.map(entry => entry.name)).toEqual([
      'claim_positive_auto_publication', 'claim_helpdesk_publication',
      'finish_helpdesk_publication', 'finish_positive_auto_publication',
    ]);
  });

  it('treats an existing sent publication as success without posting a duplicate comment', async () => {
    const state = setup({ lastSentOutcome: 'positiva' });

    expect(await processPositiveAutoPublication(state.db, state.provider))
      .toMatchObject({ processed: 1, status: 'sent' });
    expect(state.provider.publishEvaluation).not.toHaveBeenCalled();
    expect(state.calls.map(entry => entry.name)).toEqual([
      'claim_positive_auto_publication', 'finish_positive_auto_publication',
    ]);
  });

  it('publishes the final positive reevaluation and clears an earlier invalidation', async () => {
    const state = setup({ finalDecision: true, lastSentOutcome: 'negativa' });
    expect(await processPositiveAutoPublication(state.db, state.provider))
      .toMatchObject({ processed: 1, status: 'sent' });
    expect(call(state.calls, 'claim_helpdesk_publication')).toMatchObject({ p_force: true });
    expect(state.provider.publishEvaluation).toHaveBeenCalledWith({
      ticketId: work.ticket_id, outcome: 'positiva',
      htmlBody: expect.stringContaining('Atendimento correto'), clearPreviousInvalid: true, allowFollowUp: true,
    });
  });

  it.each([
    ['manager decision', 'concluida'],
    ['SLA auto-finalization', 'finalizada_alterada'],
  ])('publishes a negative %s only at the terminal status', async (_name, status) => {
    const state = setup({ row: { status, score: 74, satisfaction_result: 'Negativa', form_snapshot: {} } });
    expect(await processPositiveAutoPublication(state.db,state.provider)).toMatchObject({ status: 'sent' });
    expect(state.provider.publishEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'negativa', allowFollowUp: true,
    }));
    expect(call(state.calls,'finish_helpdesk_publication')).toMatchObject({ p_outcome: 'negativa' });
  });

  it('does not publish a review state or a stale monitoria', async () => {
    const pending = setup({ row: { status: 'pendente_revisao' } });
    expect(await processPositiveAutoPublication(pending.db,pending.provider)).toMatchObject({ status: 'skipped' });
    expect(pending.provider.publishEvaluation).not.toHaveBeenCalled();
    const stale = setup({ latestId: 'newer-monitoria' });
    expect(await processPositiveAutoPublication(stale.db,stale.provider)).toMatchObject({ status: 'skipped' });
    expect(stale.provider.publishEvaluation).not.toHaveBeenCalled();
  });

  it('routes child forms to the child macro outbox', async () => {
    const state = setup({ row: { form_id: '6c7d1e88-841b-4da9-9a66-9f1464ce896f' } });
    expect(await processPositiveAutoPublication(state.db,state.provider)).toMatchObject({ status: 'skipped' });
    expect(state.provider.publishEvaluation).not.toHaveBeenCalled();
  });

  it('skips a closed ticket without claiming or posting', async () => {
    const state = setup();
    vi.mocked(state.provider.checkPublicationEligibility).mockResolvedValue({ eligible: false, reason: 'Ticket fechado' });

    expect(await processPositiveAutoPublication(state.db, state.provider))
      .toMatchObject({ processed: 1, status: 'skipped' });
    expect(state.provider.publishEvaluation).not.toHaveBeenCalled();
    expect(call(state.calls, 'claim_helpdesk_publication')).toBeUndefined();
    expect(call(state.calls, 'finish_positive_auto_publication')).toMatchObject({
      p_status: 'skipped', p_error: 'Ticket fechado',
    });
  });

  it('retries a failure before the helpdesk write without making a receipt', async () => {
    const state = setup();
    vi.mocked(state.provider.checkPublicationEligibility).mockRejectedValue(new Error('Zendesk indisponível'));

    expect(await processPositiveAutoPublication(state.db, state.provider))
      .toMatchObject({ processed: 1, status: 'retry' });
    expect(state.provider.publishEvaluation).not.toHaveBeenCalled();
    expect(call(state.calls, 'finish_helpdesk_publication')).toBeUndefined();
    expect(call(state.calls, 'finish_positive_auto_publication')).toMatchObject({
      p_status: 'retry', p_error: 'Zendesk indisponível',
    });
  });

  it('marks an ambiguous post-send failure uncertain and never schedules a retry', async () => {
    const state = setup();
    vi.mocked(state.provider.publishEvaluation).mockRejectedValue(new Error('Timeout after PUT'));

    expect(await processPositiveAutoPublication(state.db, state.provider))
      .toMatchObject({ processed: 1, status: 'uncertain' });
    expect(state.provider.publishEvaluation).toHaveBeenCalledTimes(1);
    expect(call(state.calls, 'finish_helpdesk_publication')).toMatchObject({
      p_claim: 'claim-1', p_comment: null, p_success: false,
    });
    expect(call(state.calls, 'finish_positive_auto_publication')).toMatchObject({
      p_status: 'uncertain', p_error: 'Timeout after PUT',
    });
  });

  it('does not mark the queue sent if the helpdesk receipt fails after publishing', async () => {
    const state = setup({ receiptError: new Error('Receipt write failed') });

    expect(await processPositiveAutoPublication(state.db, state.provider))
      .toMatchObject({ processed: 1, status: 'uncertain' });
    expect(state.provider.publishEvaluation).toHaveBeenCalledTimes(1);
    expect(call(state.calls, 'finish_positive_auto_publication')).toMatchObject({ p_status: 'uncertain' });
  });
});
