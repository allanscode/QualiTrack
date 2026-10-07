import type { Monitoria, User } from '../types';
import { CHILD_TICKET_FORM_ID } from './childTicketForm';

export type EvaluationVolumeSort = 'positive' | 'negative' | 'proactive' | 'total';
type VolumeMonitoria = Pick<Monitoria, 'id' | 'evaluated_id' | 'form_id' | 'score' | 'satisfaction_result'>
  & Partial<Pick<Monitoria, 'active' | 'evaluated_name' | 'team_name' | 'form_snapshot'>>;
export interface AgentEvaluationVolume {
  id: string;
  name: string;
  teams: string[];
  positive: number;
  negative: number;
  proactive: number;
  other: number;
  total: number;
}

/** Receives only evaluations already filtered by the dashboard and RBAC. */
export function getAgentEvaluationVolumes(rows: readonly VolumeMonitoria[], users: readonly Pick<User, 'id' | 'name'>[]): AgentEvaluationVolume[] {
  const names = new Map(users.map(user => [user.id, user.name]));
  const agents = new Map<string, AgentEvaluationVolume>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.active === false || !row.evaluated_id || !Number.isFinite(row.score) || seen.has(row.id)) continue;
    seen.add(row.id);
    const agent = agents.get(row.evaluated_id) ?? {
      id: row.evaluated_id, name: names.get(row.evaluated_id) || row.evaluated_name || 'Agente não identificado',
      teams: [], positive: 0, negative: 0, proactive: 0, other: 0, total: 0,
    };
    if (row.team_name && !agent.teams.includes(row.team_name)) agent.teams.push(row.team_name);
    const snapshot = row.form_snapshot as (Monitoria['form_snapshot'] & { ticket_kind?: string });
    const child = row.form_id === CHILD_TICKET_FORM_ID || snapshot?.ticket_kind === 'chamado_filho';
    if (child) agent.other++;
    else if (row.satisfaction_result === 'Positiva') agent.positive++;
    else if (row.satisfaction_result === 'Negativa') agent.negative++;
    else if (row.satisfaction_result === 'Sem pesquisa') agent.proactive++;
    else agent.other++;
    agent.total++;
    agents.set(agent.id, agent);
  }
  return [...agents.values()].map(agent => ({ ...agent, teams: agent.teams.sort((a, b) => a.localeCompare(b, 'pt-BR')) }));
}

export function sortAgentEvaluationVolumes(rows: readonly AgentEvaluationVolume[], field: EvaluationVolumeSort, ascending = false): AgentEvaluationVolume[] {
  return [...rows].sort((a, b) => (ascending ? a[field] - b[field] : b[field] - a[field])
    || b.total - a.total || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
}
