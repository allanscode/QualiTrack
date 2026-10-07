import { describe, expect, it } from 'vitest';
import { canReadMatchedTicketTeam, canRunQueueAction, shouldMergeRecentQueueSnapshot } from './access';

describe('shouldMergeRecentQueueSnapshot', () => {
  it('only merges the shared window on the first page of distributed queues', () => {
    expect(shouldMergeRecentQueueSnapshot('negativas', undefined)).toBe(true);
    expect(shouldMergeRecentQueueSnapshot('filhos', null)).toBe(true);
    expect(shouldMergeRecentQueueSnapshot('negativas', 'https://example.test/next')).toBe(false);
    expect(shouldMergeRecentQueueSnapshot('positivas', undefined)).toBe(false);
  });
});

describe('queue audit permissions', () => {
  it('keeps support managers in read-only queue actions', () => {
    for (const action of ['evaluate_ai', 'evaluate_child_ticket', 'generate_auditor_record', 'resolve_agent', 'publish_child_macro']) {
      expect(canRunQueueAction('gestor_suporte', action)).toBe(false);
      for (const role of ['qualidade', 'gestor_qualidade', 'admin']) {
        expect(canRunQueueAction(role, action)).toBe(true);
      }
    }
    expect(canRunQueueAction('gestor_suporte', 'fetch_queue')).toBe(true);
  });
});

describe('ticket lookup team boundary', () => {
  it('allows a manager only when the ticket resolves to one of their teams', () => {
    expect(canReadMatchedTicketTeam('gestor_suporte', 'pj-bruno', ['pj-bruno'])).toBe(true);
    expect(canReadMatchedTicketTeam('gestor_suporte', 'pj-duarte', ['pj-bruno'])).toBe(false);
    expect(canReadMatchedTicketTeam('gestor_suporte', null, ['pj-bruno'])).toBe(false);
    expect(canReadMatchedTicketTeam('qualidade', null, [])).toBe(true);
    expect(canReadMatchedTicketTeam('suporte', 'pj-bruno', ['pj-bruno'])).toBe(false);
  });
});
