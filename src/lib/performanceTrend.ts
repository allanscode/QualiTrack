import { isEvaluationValid } from './domainRules';

interface ScoredEvaluation {
  created_at: string;
  score: number | null;
}

export interface PerformanceTrendPoint {
  name: string;
  ScoreMedio: number;
  ScoreEquipe: number;
  Positivas: number | null;
  Negativas: number | null;
}

/** Daily average score overall and within each domain outcome (75% threshold). */
export function buildPerformanceTrend(evaluations: ScoredEvaluation[]): PerformanceTrendPoint[] {
  const days = new Map<string, { total: number; count: number; positive: number; positiveCount: number; negative: number; negativeCount: number }>();
  for (const evaluation of evaluations) {
    if (evaluation.score === null || !Number.isFinite(evaluation.score)) continue;
    const date = new Date(evaluation.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const day = days.get(key) || { total: 0, count: 0, positive: 0, positiveCount: 0, negative: 0, negativeCount: 0 };
    day.total += evaluation.score;
    day.count += 1;
    if (isEvaluationValid(evaluation.score)) {
      day.positive += evaluation.score;
      day.positiveCount += 1;
    } else {
      day.negative += evaluation.score;
      day.negativeCount += 1;
    }
    days.set(key, day);
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, day]) => {
    const [, month, date] = key.split('-');
    const average = round(day.total / day.count);
    return {
      name: `${date}/${month}`,
      ScoreMedio: average,
      ScoreEquipe: average,
      Positivas: day.positiveCount ? round(day.positive / day.positiveCount) : null,
      Negativas: day.negativeCount ? round(day.negative / day.negativeCount) : null,
    };
  });
}
