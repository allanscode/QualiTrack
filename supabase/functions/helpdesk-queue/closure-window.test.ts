import { describe, expect, it } from 'vitest';
import { addZendeskBusinessHours } from './closure-window';

const intervals = [1, 2, 3, 4, 5].map(day => ({
  start_time: day * 1440 + 8 * 60,
  end_time: day * 1440 + 17 * 60 + 30,
}));

describe('Zendesk closure window', () => {
  it('uses the 9.5-hour Zendesk schedule for the QWP cap', () => {
    expect(addZendeskBusinessHours('2026-10-05T11:00:00Z', 36, intervals, []))
      .toBe('2026-10-08T18:30:00.000Z');
  });

  it('skips registered Zendesk holidays and weekends', () => {
    expect(addZendeskBusinessHours('2026-10-09T19:30:00Z', 36, intervals,
      [{ start_date: '2026-10-12', end_date: '2026-10-12' }]))
      .toBe('2026-10-16T17:30:00.000Z');
  });
});
