import type { Monitoria } from '../types';

export const QUALITY_MANAGER_ACTION_STATUSES = ['em_contestacao', 'aguardando_gestor_qualidade'] as const;

export function selectQualityManagerActions(monitorias: Monitoria[]): Monitoria[] {
  const statuses: ReadonlySet<string> = new Set(QUALITY_MANAGER_ACTION_STATUSES);
  return monitorias.filter(monitoria => monitoria.active !== false && statuses.has(monitoria.status));
}
