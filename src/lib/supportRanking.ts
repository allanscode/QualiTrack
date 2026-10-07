import type { Monitoria, User } from '../types';
import type { DashboardFilters } from '../components/dashboard/DashboardContext';

export const SUPPORT_RANKING_PRIOR_WEIGHT = 5;

export interface SupportRankingItem {
  id: string;
  name: string;
  score: number;
  rawScore: number;
  teamScore: number;
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

export function buildSupportRanking(
  rows: readonly Monitoria[],
  baseline: readonly Monitoria[],
  users: readonly Pick<User, 'id' | 'name'>[],
): SupportRankingItem[] {
  const valid = (row: Monitoria) => row.active !== false && Number.isFinite(row.score);
  const teams = new Map<string | undefined, { total: number; count: number }>();
  baseline.filter(valid).forEach(row => {
    const team = teams.get(row.team_id) ?? { total: 0, count: 0 };
    team.total += row.score;
    team.count++;
    teams.set(row.team_id, team);
  });
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
    // For multiple teams, weight each team mean by the agent's evaluation distribution.
    // Unassigned evaluations form their own cohort, never borrowing from another team.
    const teamScore = monitorias.reduce((sum, row) => {
      const team = teams.get(row.team_id);
      return sum + (team ? team.total / team.count : rawScore);
    }, 0) / count;
    return {
      id, name: names.get(id) ?? id, rawScore, teamScore, count, monitorias,
      score: (total + SUPPORT_RANKING_PRIOR_WEIGHT * teamScore) / (count + SUPPORT_RANKING_PRIOR_WEIGHT),
    };
  }).sort(compareSupportRanking);
}
