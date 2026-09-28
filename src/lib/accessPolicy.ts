import type { UserRole } from '../types';

// Temporary rollout gate: agent access is enabled only after the managers' implementation phase.
export const AGENT_ACCESS_ENABLED = false;

export const AGENT_ACCESS_PAUSED_MESSAGE = 'O acesso dos Agentes de Atendimento ainda não foi liberado. Estamos em fase de implementação com os gestores.';

export function canAccessApp(role: UserRole): boolean {
  return role !== 'suporte' || AGENT_ACCESS_ENABLED;
}
