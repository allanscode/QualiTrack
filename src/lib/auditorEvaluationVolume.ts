import type { Monitoria, User } from '../types';

type SavedMonitoria = Pick<Monitoria, 'id'> & Partial<Pick<Monitoria, 'active' | 'evaluator_id' | 'evaluator_name' | 'form_snapshot'>>;
export interface AuditorEvaluationVolume { id: string; name: string; manual: number; automatic: number; total: number }

/** Counts persisted monitorias already restricted by dashboard filters/RBAC.
 * Scores and current evaluator roles do not erase historical production. */
export function getAuditorEvaluationVolumes(
  monitorias: readonly SavedMonitoria[], users: readonly Pick<User, 'id' | 'name'>[],
): AuditorEvaluationVolume[] {
  const names = new Map(users.map(user => [user.id, user.name]));
  const totals = new Map<string, AuditorEvaluationVolume>();
  const seen = new Set<string>();
  for (const monitoria of monitorias) {
    if (!monitoria.id || monitoria.active === false || seen.has(monitoria.id)) continue;
    seen.add(monitoria.id);
    const savedName = monitoria.evaluator_name?.trim();
    const id = monitoria.evaluator_id || (savedName ? `legacy:${savedName.toLocaleLowerCase('pt-BR')}` : 'unknown');
    const snapshot=monitoria.form_snapshot as {automation?:string;ai_evaluation?:{automatic_positive?:boolean;automatic_child?:boolean}} | undefined;
    const automatic=snapshot?.automation==='positive_csat' || snapshot?.automation==='child_ticket'
      || snapshot?.ai_evaluation?.automatic_positive===true || snapshot?.ai_evaluation?.automatic_child===true;
    const existing = totals.get(id) || { id, name: (monitoria.evaluator_id && names.get(monitoria.evaluator_id)) || savedName || 'Monitor não identificado',manual:0,automatic:0,total:0 };
    existing.total++;
    if (automatic) existing.automatic++; else existing.manual++;
    totals.set(id,existing);
  }
  return [...totals.values()];
}

export function sortAuditorEvaluationVolumes(rows: readonly AuditorEvaluationVolume[], ascending = false): AuditorEvaluationVolume[] {
  return [...rows].sort((a,b) => (ascending ? a.total-b.total : b.total-a.total)
    || a.name.localeCompare(b.name,'pt-BR') || a.id.localeCompare(b.id));
}
