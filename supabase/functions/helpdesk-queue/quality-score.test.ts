import { describe, expect, it } from 'vitest';
import { calculateCanonicalQualityScore } from './quality-score';

describe('calculateCanonicalQualityScore', () => {
  it('overrides a divergent model score with the form calculation', () => {
    const sections = [{
      weight: 100,
      questions: Array.from({ length: 10 }, (_, index) => ({ id: `q${index + 1}` })),
    }];
    const answers = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
      `q${index + 1}`,
      index < 7 ? 'SIM' : 'NAO',
    ])) as Record<string, 'SIM' | 'NAO'>;

    expect(calculateCanonicalQualityScore(sections, answers)).toBe(70);
  });

  it('zeros the score when a critical criterion fails', () => {
    expect(calculateCanonicalQualityScore(
      [{ weight: 100, questions: [{ id: 'critical', is_critical: true }] }],
      { critical: 'NAO' },
    )).toBe(0);
  });

  it('matches the official frontend behavior for an empty form', () => {
    expect(calculateCanonicalQualityScore([], {})).toBe(0);
  });
});
