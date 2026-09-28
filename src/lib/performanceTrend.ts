import { isEvaluationValid } from './domainRules';

export type TrendGranularity = 'day' | 'month' | 'year';
export interface TrendFilters {
  startDate: string; endDate: string;
  teamId?: string; agentId?: string; auditorId?: string;
  formId?: string; status?: string; channel?: string;
}
export interface TrendEvaluation {
  created_at: string; score: number | null;
  team_id?: string | null; evaluated_id?: string | null; evaluator_id?: string | null;
  form_id?: string | null; status?: string; channel?: string | null; active?: boolean;
}
export interface PerformanceTrendPoint {
  name: string; ScoreMedio: number; ScoreEquipe: number;
  Positivas: number | null; Negativas: number | null;
}
export interface ComparisonTrendPoint {
  name: string; MeuScore: number | null; MediaEquipe: number | null;
}

const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const round = (value: number) => Math.round(value * 100) / 100;

function calendarDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function period(value: string, granularity: TrendGranularity): { key: string; label: string } | null {
  const date = calendarDate(value);
  if (!date) return null;
  const [year, month, day] = date.split('-');
  if (granularity === 'year') return { key: year, label: year };
  if (granularity === 'month') return { key: `${year}-${month}`, label: `${monthNames[Number(month) - 1]}/${year.slice(-2)}` };
  return { key: date, label: `${day}/${month}` };
}

/** Dia, Mês e Ano selecionam a escala dos pontos; datas livres usam a duração do intervalo. */
export function getTrendGranularity(filters: Pick<TrendFilters, 'startDate' | 'endDate'>): TrendGranularity {
  const { startDate: start, endDate: end } = filters;
  if (start && end && start === end) return 'day';
  if (start && end && start.slice(0, 7) === end.slice(0, 7) && start.endsWith('-01')) {
    const [year, month] = start.split('-').map(Number);
    if (Number(end.slice(-2)) === new Date(year, month, 0).getDate()) return 'month';
  }
  if (start && end && start.slice(0, 4) === end.slice(0, 4)
    && start.endsWith('-01-01') && end.endsWith('-12-31')) return 'year';
  const span = (new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86_400_000;
  if (!Number.isFinite(span) || span <= 31) return 'day';
  return span <= 366 ? 'month' : 'year';
}

/** Preset charts show a rolling history ending at the selected date; other filters still apply. */
export function selectTrendEvaluations<T extends TrendEvaluation>(
  evaluations: T[], filters: TrendFilters, role?: string,
): { evaluations: T[]; granularity: TrendGranularity } {
  const granularity = getTrendGranularity(filters);
  const anchor = filters.endDate || new Date().toISOString().slice(0, 10);
  const [year, month, day] = anchor.split('-').map(Number);
  const isDayPreset = !!filters.startDate && filters.startDate === anchor;
  const isMonthPreset = !!filters.startDate && filters.startDate.slice(0, 7) === anchor.slice(0, 7)
    && filters.startDate.endsWith('-01') && day === new Date(year, month, 0).getDate();
  const isYearPreset = !!filters.startDate && filters.startDate === `${year}-01-01` && anchor === `${year}-12-31`;
  const isPreset = isDayPreset || isMonthPreset || isYearPreset;
  let windowStart = filters.startDate;
  if (isPreset && Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
    if (granularity === 'day') {
      const date = new Date(Date.UTC(year, month - 1, day));
      date.setUTCDate(date.getUTCDate() - 29);
      windowStart = date.toISOString().slice(0, 10);
    } else if (granularity === 'month') {
      windowStart = new Date(Date.UTC(year, month - 12, 1)).toISOString().slice(0, 10);
    } else {
      windowStart = `${year - 4}-01-01`;
    }
  }
  return {
    granularity,
    evaluations: evaluations.filter(evaluation => {
      if (evaluation.active === false || evaluation.score === null || !Number.isFinite(evaluation.score)) return false;
      const date = calendarDate(evaluation.created_at);
      if (!date || (windowStart && date < windowStart) || (filters.endDate && date > filters.endDate)) return false;
      if (filters.teamId && evaluation.team_id !== filters.teamId) return false;
      if (filters.agentId && role !== 'suporte' && evaluation.evaluated_id !== filters.agentId) return false;
      if (filters.auditorId && evaluation.evaluator_id !== filters.auditorId) return false;
      if (filters.formId && evaluation.form_id !== filters.formId) return false;
      if (filters.status && evaluation.status !== filters.status) return false;
      if (filters.channel && evaluation.channel !== filters.channel) return false;
      return true;
    }),
  };
}

/** Mean scores per period, including the positive and negative series. */
export function buildPerformanceTrend(
  evaluations: Pick<TrendEvaluation, 'created_at' | 'score'>[], granularity: TrendGranularity = 'day',
): PerformanceTrendPoint[] {
  const groups = new Map<string, { label: string; total: number; count: number; positive: number; positiveCount: number; negative: number; negativeCount: number }>();
  for (const evaluation of evaluations) {
    if (evaluation.score === null || !Number.isFinite(evaluation.score)) continue;
    const bucket = period(evaluation.created_at, granularity);
    if (!bucket) continue;
    const group = groups.get(bucket.key) || { label: bucket.label, total: 0, count: 0, positive: 0, positiveCount: 0, negative: 0, negativeCount: 0 };
    group.total += evaluation.score;
    group.count++;
    if (isEvaluationValid(evaluation.score)) { group.positive += evaluation.score; group.positiveCount++; }
    else { group.negative += evaluation.score; group.negativeCount++; }
    groups.set(bucket.key, group);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => {
    const average = round(group.total / group.count);
    return {
      name: group.label, ScoreMedio: average, ScoreEquipe: average,
      Positivas: group.positiveCount ? round(group.positive / group.positiveCount) : null,
      Negativas: group.negativeCount ? round(group.negative / group.negativeCount) : null,
    };
  });
}

/** Agent and team use the same period keys; missing values remain null. */
export function buildComparisonTrend(
  mine: Pick<TrendEvaluation, 'created_at' | 'score'>[],
  team: Pick<TrendEvaluation, 'created_at' | 'score'>[], granularity: TrendGranularity,
): ComparisonTrendPoint[] {
  const groups = new Map<string, { label: string; mine: number; mineCount: number; team: number; teamCount: number }>();
  for (const [series, items] of [['mine', mine], ['team', team]] as const) {
    for (const item of items) {
      if (item.score === null || !Number.isFinite(item.score)) continue;
      const bucket = period(item.created_at, granularity);
      if (!bucket) continue;
      const group = groups.get(bucket.key) || { label: bucket.label, mine: 0, mineCount: 0, team: 0, teamCount: 0 };
      group[series] += item.score;
      group[series === 'mine' ? 'mineCount' : 'teamCount']++;
      groups.set(bucket.key, group);
    }
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => ({
    name: group.label,
    MeuScore: group.mineCount ? round(group.mine / group.mineCount) : null,
    MediaEquipe: group.teamCount ? round(group.team / group.teamCount) : null,
  }));
}
