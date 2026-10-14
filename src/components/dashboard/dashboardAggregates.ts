import type { Monitoria, User } from '../../types';
import type { DashboardAggregates } from './DashboardContext';
import type { SupportRankingItem } from '../../lib/supportRanking';
import { compareSupportRanking } from '../../lib/supportRanking';

/** Build display rows from the server totals. Local rows are used only by a drilldown. */
export function aggregatedSupportRanking(
  aggregates: DashboardAggregates,
  visibleRows: readonly Monitoria[],
  users: readonly Pick<User, 'id' | 'name'>[],
): SupportRankingItem[] {
  const names = new Map(users.map(user => [user.id, user.name]));
  const rows = new Map<string, Monitoria[]>();
  for (const row of visibleRows) {
    if (!row.evaluated_id) continue;
    const group = rows.get(row.evaluated_id) ?? [];
    group.push(row);
    rows.set(row.evaluated_id, group);
  }
  return aggregates.agents.map(agent => ({
    id: agent.id,
    name: names.get(agent.id) ?? agent.id,
    count: agent.count,
    rawScore: Number(agent.average),
    score: Number(agent.score ?? 0),
    badness: Number(agent.badness ?? 0),
    monitorias: rows.get(agent.id) ?? [],
  })).sort(compareSupportRanking);
}
