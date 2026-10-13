// Pure reconciliation: missing identities never justify deleting a team's links.
export function planPrimaryGroupLinks(state, audit) {
  if (!audit.success || !Array.isArray(audit.rows)) throw new Error('Incomplete Zendesk audit');
  const rows = new Map(audit.rows.map(row => [row.user_id, row]));
  const plans = [];
  for (const team of state.teams.filter(team => team.kind === 'team' && team.active !== false)) {
    const agents = state.agents.filter(agent => agent.primary_team_id === team.id);
    if (!agents.length) continue;
    const desired = new Set();
    const groupBindings = new Map();
    const unresolved = [];
    for (const agent of agents) {
      const row = rows.get(agent.id);
      const ids = row?.zendesk_primary_group_ids;
      if (row?.current_team !== team.name || !Array.isArray(ids) || ids.length !== 1) {
        unresolved.push(agent.name);
        continue;
      }
      let groups = state.teams.filter(group => group.kind === 'group' && group.active !== false
        && String(group.zendesk_group_id) === String(ids[0]));
      // Legacy imports have no external ID. Only an exact, unique name can
      // establish that ID; never fuzzy-match names or overwrite another ID.
      if (!groups.length && row.zendesk_primary_groups?.length === 1) {
        groups = state.teams.filter(group => group.kind === 'group' && group.active !== false
          && group.zendesk_group_id == null && group.name === row.zendesk_primary_groups[0]);
        if (groups.length === 1) groupBindings.set(groups[0].id, { id: groups[0].id, zendesk_group_id: ids[0] });
      }
      if (groups.length !== 1) { unresolved.push(agent.name); continue; }
      desired.add(groups[0].id);
    }
    const current = state.links.filter(link => link.team_id === team.id).map(link => link.group_id);
    plans.push({ team_id: team.id, team: team.name, agent_count: agents.length, unresolved,
      groupBindings: unresolved.length ? [] : [...groupBindings.values()],
      current, desired: [...desired].sort(),
      add: unresolved.length ? [] : [...desired].filter(id => !current.includes(id)),
      remove: unresolved.length ? [] : current.filter(id => !desired.has(id)) });
  }
  return plans;
}
