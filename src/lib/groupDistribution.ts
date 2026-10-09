import type { Monitoria, Team } from '../types';

export interface GroupDistributionItem {
  name: string;
  value: number;
  color: string;
}

/** Distribui as avaliações pelo grupo de origem do ticket, sem usar a equipe gestora. */
export function buildGroupDistribution(
  monitorias: readonly Monitoria[],
  teams: readonly Team[],
  colors: readonly string[],
): GroupDistributionItem[] {
  const groupsById = new Map(teams.filter(team => team.kind === 'group').map(group => [group.id, group.name]));
  const counts = new Map<string, number>();

  monitorias.forEach(monitoria => {
    const groupId = monitoria.ticket_group_team_id;
    const key = groupId && groupsById.has(groupId) ? groupId : 'missing';
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1]
      || Number(a[0] === 'missing') - Number(b[0] === 'missing')
      || (groupsById.get(a[0]) || '').localeCompare(groupsById.get(b[0]) || '', 'pt-BR'))
    .map(([id, value], index) => ({
      name: groupsById.get(id) || 'Grupo não informado',
      value,
      color: colors[index % colors.length] || '#94a3b8',
    }));
}
