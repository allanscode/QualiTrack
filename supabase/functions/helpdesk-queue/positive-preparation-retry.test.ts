import { describe, expect, it } from 'vitest';
import { nextPositivePreparationAttempt, PositivePreparationError } from './positive-preparation-retry';

describe('positive preparation retries', () => {
  it('stops immediately when ticket data needs correction', () => {
    expect(nextPositivePreparationAttempt(new PositivePreparationError('Ambiguous customer'), 1)).toBe('infinity');
  });
  it('backs off temporary failures and stops after five attempts', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(nextPositivePreparationAttempt(new TypeError('fetch failed'), 1, now)).toBe('2026-10-13T12:02:00.000Z');
    expect(nextPositivePreparationAttempt(new Error('503'), 4, now)).toBe('2026-10-13T12:16:00.000Z');
    expect(nextPositivePreparationAttempt(new Error('503'), 5, now)).toBe('infinity');
    expect(nextPositivePreparationAttempt(new Error('503'), 123, now)).toBe('infinity');
  });
});
