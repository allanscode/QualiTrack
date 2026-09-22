import { describe, expect, it } from 'vitest';
import { nextRetryDelayMs, retryAt } from './ai-retry';

describe('reprocessamento durável', () => {
  it('aumenta progressivamente até o teto de uma hora', () => {
    expect([0, 1, 2, 3, 20].map(nextRetryDelayMs))
      .toEqual([60_000, 120_000, 240_000, 480_000, 3_600_000]);
    expect(retryAt(2, 0)).toBe('1970-01-01T00:04:00.000Z');
  });
});
