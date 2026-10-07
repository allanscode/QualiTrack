import type { EvaluationForm, Monitoria, User } from '../types';

export type PositiveExceptionKind = 'below_threshold' | 'critical_zero';
export interface PositiveCriticalReason { id: string; label: string; observation?: string }
export interface PositiveEvaluationException {
  monitoria: Monitoria;
  agentName: string;
  criticalReasons: PositiveCriticalReason[];
}

function criticalReasons(monitoria: Monitoria, forms: readonly EvaluationForm[]): PositiveCriticalReason[] {
  const form=monitoria.form_snapshot || forms.find(candidate=>candidate.id===monitoria.form_id);
  const labels=new Map<string,string>();
  const ids=new Set<string>();
  for (const section of form?.sections || []) {
    for (const question of section.questions || []) {
      labels.set(question.id,question.text);
      if (question.is_critical && monitoria.answers?.[question.id]==='NAO') ids.add(question.id);
    }
  }
  for (const error of form?.critical_errors || []) labels.set(error.id,error.text);
  for (const id of monitoria.selected_critical_errors || []) if (id.trim()) ids.add(id);
  const snapshot=monitoria.form_snapshot as (EvaluationForm & {
    ai_evaluation?:{suggested_critical_errors?:Record<string,boolean>;suggested_observations?:Record<string,string>};
  }) | undefined;
  for (const [id,failed] of Object.entries(snapshot?.ai_evaluation?.suggested_critical_errors || {})) {
    if (failed===true) ids.add(id);
  }
  return [...ids].map(id=>({
    id,label:labels.get(id) || 'Erro crítico registrado',
    observation:monitoria.critical_error_observations?.[id] || monitoria.question_observations?.[id]
      || snapshot?.ai_evaluation?.suggested_observations?.[id],
  }));
}

/** Saved monitorias only. The dashboard supplies the authorized/date-filtered
 * rows; a zero score without recorded critical evidence is not a critical zero. */
export function getPositiveEvaluationExceptions(
  monitorias: readonly Monitoria[], forms: readonly EvaluationForm[], users: readonly Pick<User,'id'|'name'>[],
  kind: PositiveExceptionKind,
): PositiveEvaluationException[] {
  const names=new Map(users.map(user=>[user.id,user.name]));
  const seen=new Set<string>();
  const rows: PositiveEvaluationException[]=[];
  for (const monitoria of monitorias) {
    if (!monitoria.id || seen.has(monitoria.id) || monitoria.active===false || monitoria.satisfaction_result!=='Positiva'
      || !Number.isFinite(monitoria.score) || monitoria.score<0 || monitoria.score>=75) continue;
    seen.add(monitoria.id);
    const reasons=criticalReasons(monitoria,forms);
    if (kind==='critical_zero' && (monitoria.score!==0 || reasons.length===0)) continue;
    rows.push({monitoria,agentName:names.get(monitoria.evaluated_id) || monitoria.evaluated_name || 'Agente não identificado',criticalReasons:reasons});
  }
  return rows.sort((a,b)=>(Date.parse(b.monitoria.created_at)||0)-(Date.parse(a.monitoria.created_at)||0)
    || a.monitoria.id.localeCompare(b.monitoria.id));
}
