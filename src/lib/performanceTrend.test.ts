import { describe, expect, it } from 'vitest';
import { buildPerformanceTrend } from './performanceTrend';

describe('buildPerformanceTrend', () => {
  it('calculates daily global, positive and negative averages using the fixed 75% threshold', () => {
    expect(buildPerformanceTrend([
      { created_at: '2026-09-29T10:00:00', score: 75 },
      { created_at: '2026-09-29T11:00:00', score: 90 },
      { created_at: '2026-09-29T12:00:00', score: 30 },
      { created_at: '2026-09-28T10:00:00', score: 60 },
    ])).toEqual([
      { name: '28/09', ScoreMedio: 60, ScoreEquipe: 60, Positivas: null, Negativas: 60 },
      { name: '29/09', ScoreMedio: 65, ScoreEquipe: 65, Positivas: 82.5, Negativas: 30 },
    ]);
  });
});
