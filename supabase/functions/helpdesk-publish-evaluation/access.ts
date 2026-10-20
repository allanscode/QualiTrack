export function publicationAccess(
  caller: { id: string; role: string; active: boolean },
  monitoria: { active: boolean; evaluator_id: string | null; evaluated_id: string | null; team_id: string | null; status?: string; history?: Array<{ action?: string; by_id?: string }> },
  teamIds: string[],
): { preview: boolean; publish: boolean } {
  if (!caller.active || !monitoria.active) return { preview: false, publish: false };
  const lastDecision = monitoria.history?.[monitoria.history.length - 1];
  const managerConclusion = caller.role === 'gestor_suporte'
    && !!monitoria.team_id && teamIds.includes(monitoria.team_id)
    && monitoria.status === 'concluida'
    && lastDecision?.by_id === caller.id
    && lastDecision.action === 'Monitoria aprovada e concluída pelo Gestor de Suporte';
  const publish = ['admin', 'gestor_qualidade'].includes(caller.role) ||
    (caller.role === 'qualidade' && monitoria.evaluator_id === caller.id) || managerConclusion;
  const preview = publish || (caller.role === 'suporte' && monitoria.evaluated_id === caller.id) ||
    (caller.role === 'gestor_suporte' && !!monitoria.team_id && teamIds.includes(monitoria.team_id));
  return { preview, publish };
}
