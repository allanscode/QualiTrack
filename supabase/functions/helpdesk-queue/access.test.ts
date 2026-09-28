import { describe, expect, it } from 'vitest';
import { canRunQueueAction, shouldMergeRecentQueueSnapshot } from './access';

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
    for (const action of ['evaluate_ai', 'evaluate_child_ticket', 'generate_auditor_record', 'resolve_agent']) {
      expect(canRunQueueAction('gestor_suporte', action)).toBe(false);
      for (const role of ['qualidade', 'gestor_qualidade', 'admin']) {
        expect(canRunQueueAction(role, action)).toBe(true);
      }
    }
    expect(canRunQueueAction('gestor_suporte', 'fetch_queue')).toBe(true);
  });
});
