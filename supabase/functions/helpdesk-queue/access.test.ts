import { describe, expect, it } from 'vitest';
import { shouldMergeRecentQueueSnapshot } from './access';

describe('shouldMergeRecentQueueSnapshot', () => {
  it('only merges the shared window on the first page of distributed queues', () => {
    expect(shouldMergeRecentQueueSnapshot('negativas', undefined)).toBe(true);
    expect(shouldMergeRecentQueueSnapshot('filhos', null)).toBe(true);
    expect(shouldMergeRecentQueueSnapshot('negativas', 'https://example.test/next')).toBe(false);
    expect(shouldMergeRecentQueueSnapshot('positivas', undefined)).toBe(false);
  });
});
