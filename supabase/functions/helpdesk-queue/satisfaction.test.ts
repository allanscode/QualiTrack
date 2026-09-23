import { describe, expect, it } from 'vitest';
import { satisfactionResponseTimestamp } from './satisfaction';

describe('satisfactionResponseTimestamp', () => {
  it('uses updated_at as the moment the customer submitted the rating', () => {
    expect(satisfactionResponseTimestamp({ satisfaction_rating: {
      created_at: '2026-09-23T17:00:00Z', updated_at: '2026-09-23T20:14:00Z',
    } })).toBe('2026-09-23T20:14:00Z');
  });

  it('supports the array shape returned by some legacy accounts', () => {
    expect(satisfactionResponseTimestamp({ satisfaction_rating: [{ created_at: '2026-09-23T20:14:00Z' }] }))
      .toBe('2026-09-23T20:14:00Z');
  });
});
