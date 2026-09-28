import { describe, expect, it } from 'vitest';
import { buildComparisonTrend, buildPerformanceTrend, getTrendGranularity, selectTrendEvaluations } from './performanceTrend';

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

  it('groups monthly and yearly points with the correct means and missing series', () => {
    const evaluations = [
      { created_at: '2025-12-20T12:00:00-03:00', score: 80 },
      { created_at: '2026-01-10T12:00:00-03:00', score: 90 },
      { created_at: '2026-01-20T12:00:00-03:00', score: 50 },
      { created_at: '2026-02-10T12:00:00-03:00', score: 75 },
    ];
    expect(buildPerformanceTrend(evaluations, 'month')).toEqual([
      { name: 'dez/25', ScoreMedio: 80, ScoreEquipe: 80, Positivas: 80, Negativas: null },
      { name: 'jan/26', ScoreMedio: 70, ScoreEquipe: 70, Positivas: 90, Negativas: 50 },
      { name: 'fev/26', ScoreMedio: 75, ScoreEquipe: 75, Positivas: 75, Negativas: null },
    ]);
    expect(buildPerformanceTrend(evaluations, 'year').map(point => [point.name, point.ScoreMedio]))
      .toEqual([['2025', 80], ['2026', 71.67]]);
  });

  it('changes scale with Dia, Mês and Ano and keeps role/team filters in historical window', () => {
    expect(getTrendGranularity({ startDate: '2026-09-28', endDate: '2026-09-28' })).toBe('day');
    expect(getTrendGranularity({ startDate: '2026-09-01', endDate: '2026-09-30' })).toBe('month');
    expect(getTrendGranularity({ startDate: '2026-01-01', endDate: '2026-12-31' })).toBe('year');
    const evaluations = [
      { created_at: '2025-10-01T12:00:00-03:00', score: 80, team_id: 'A', evaluated_id: 'u1' },
      { created_at: '2026-08-01T12:00:00-03:00', score: 90, team_id: 'A', evaluated_id: 'u1' },
      { created_at: '2026-09-01T12:00:00-03:00', score: 70, team_id: 'B', evaluated_id: 'u1' },
      { created_at: '2024-09-01T12:00:00-03:00', score: 60, team_id: 'A', evaluated_id: 'u1' },
    ];
    const selected = selectTrendEvaluations(evaluations, {
      startDate: '2026-09-01', endDate: '2026-09-30', teamId: 'A',
    });
    expect(selected.granularity).toBe('month');
    expect(selected.evaluations.map(item => item.score)).toEqual([80, 90]);
  });

  it('aligns agent and team scores by month instead of matching day labels', () => {
    expect(buildComparisonTrend(
      [{ created_at: '2026-08-01T12:00:00-03:00', score: 80 }, { created_at: '2026-09-02T12:00:00-03:00', score: 90 }],
      [{ created_at: '2026-09-15T12:00:00-03:00', score: 70 }], 'month',
    )).toEqual([
      { name: 'ago/26', MeuScore: 80, MediaEquipe: null },
      { name: 'set/26', MeuScore: 90, MediaEquipe: 70 },
    ]);
  });

  it('uses a rolling daily or yearly history only for complete presets', () => {
    const evaluations = [
      { created_at: '2026-08-31T12:00:00-03:00', score: 70 },
      { created_at: '2026-09-01T12:00:00-03:00', score: 80 },
      { created_at: '2026-09-28T12:00:00-03:00', score: 90 },
      { created_at: '2024-06-01T12:00:00-03:00', score: 60 },
      { created_at: '2020-06-01T12:00:00-03:00', score: 50 },
    ];
    expect(selectTrendEvaluations(evaluations, { startDate: '2026-09-28', endDate: '2026-09-28' })
      .evaluations.map(item => item.score)).toEqual([70, 80, 90]);
    expect(selectTrendEvaluations(evaluations, { startDate: '2026-01-01', endDate: '2026-12-31' })
      .evaluations.map(item => item.score)).toEqual([70, 80, 90, 60]);
    expect(selectTrendEvaluations(evaluations, { startDate: '2026-09-01', endDate: '2026-09-15' })
      .evaluations.map(item => item.score)).toEqual([80]);
  });
});
