import type { Monitoria, MonitoriaHistoryEntry, User } from '../types';

export type ManagerDecision = {
  monitoria: Monitoria;
  entry: MonitoriaHistoryEntry;
  kind: 'approval' | 'contestation' | 'reevaluation';
};

export function getManagerDecisionHistory(monitorias: Monitoria[], users: User[]): ManagerDecision[] {
  const decisionMakers = new Map(users
    .filter(user => ['gestor_suporte', 'gestor_qualidade', 'qualidade'].includes(user.role))
    .map(user => [user.id, user.role]));
  return monitorias.flatMap(monitoria => (monitoria.history || []).flatMap(entry => {
    const action = entry.action.toLocaleLowerCase('pt-BR');
    const normalizedAction = action.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let kind: ManagerDecision['kind'] | null = null;
    const actorRole = decisionMakers.get(entry.by_id);
    if (/reavaliad|reavaliacao (?:aceita|recusada|indeferida|deferida)/.test(normalizedAction)
      && actorRole === 'qualidade') kind = 'reevaluation';
    else if (/contest|escalad|devolvid/.test(action)
      && (actorRole === 'gestor_suporte' || actorRole === 'gestor_qualidade'
        || /gestor.*(suporte|atendimento|pj)|gestao.*qualidade|qualidade/.test(normalizedAction))) kind = 'contestation';
    else if (/aprov|aceit|validada|concluida/.test(normalizedAction)
      && (actorRole === 'gestor_suporte' || actorRole === 'gestor_qualidade'
        || /gestor.*(suporte|atendimento|pj)|gestao.*qualidade|qualidade/.test(normalizedAction))) kind = 'approval';
    if (!kind || !entry.at || Number.isNaN(Date.parse(entry.at))) return [];
    return [{ monitoria, entry, kind }];
  })).sort((a, b) => Date.parse(b.entry.at) - Date.parse(a.entry.at));
}
