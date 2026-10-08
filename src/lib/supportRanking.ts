import type { Monitoria, User } from '../types';
import type { DashboardFilters } from '../components/dashboard/DashboardContext';

export interface SupportRankingItem {
  id: string;
  name: string;
  score: number;
  rawScore: number;
  badness: number;
  count: number;
  monitorias: Monitoria[];
}

/** Input must already be scoped by RBAC. Agent selection must not change the team baseline. */
export function selectRankingBaseline(rows: readonly Monitoria[], filters: Partial<DashboardFilters>): Monitoria[] {
  const start = filters.startDate ? new Date(filters.startDate).getTime() : 0;
  const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59`).getTime() : Infinity;
  return rows.filter(row => {
    const date = row.created_at ? new Date(row.created_at).getTime() : undefined;
    return row.active !== false && (date === undefined || (date >= start && date <= end))
      && (!filters.teamId || row.team_id === filters.teamId)
      && (!filters.auditorId || row.evaluator_id === filters.auditorId)
      && (!filters.formId || row.form_id === filters.formId)
      && (!filters.status || row.status === filters.status)
      && (!filters.channel || row.channel === filters.channel);
  });
}

export function compareSupportRanking(a: SupportRankingItem, b: SupportRankingItem, ascending = false): number {
  return (ascending ? a.score - b.score : b.score - a.score)
    || b.count - a.count || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id);
}

export function compareSupportOffenders(a: SupportRankingItem, b: SupportRankingItem): number {
  return b.badness - a.badness || b.count - a.count
    || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id);
}

export function buildSupportRanking(
  rows: readonly Monitoria[],
  baseline: readonly Monitoria[],
  users: readonly Pick<User, 'id' | 'name'>[],
): SupportRankingItem[] {
  const valid = (row: Monitoria) => row.active !== false && Number.isFinite(row.score);
  // The denominator is the full authorized selection: one team when filtered,
  // all visible teams in General. Never narrow it to the selected agent.
  const evaluationCount = baseline.filter(valid).length;
  const agents = new Map<string, Monitoria[]>();
  rows.filter(valid).forEach(row => {
    if (!row.evaluated_id) return;
    const evaluations = agents.get(row.evaluated_id) ?? [];
    evaluations.push(row);
    agents.set(row.evaluated_id, evaluations);
  });
  const names = new Map(users.map(user => [user.id, user.name]));
  return [...agents].map(([id, monitorias]) => {
    const count = monitorias.length;
    const total = monitorias.reduce((sum, row) => sum + row.score, 0);
    const rawScore = total / count;
    const denominator = evaluationCount || count;
    const score = total / denominator; // (agent count / total count) × agent mean
    const badness = (100 * count - total) / denominator;
    return {
      id, name: names.get(id) ?? id, rawScore, badness, count, monitorias, score,
    };
  }).sort(compareSupportRanking);
}
