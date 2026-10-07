import type { Monitoria, MonitoriaHistoryEntry, User } from '../types';

export type ManagerDecision = {
  monitoria: Monitoria;
  entry: MonitoriaHistoryEntry;
  kind: 'approval' | 'contestation';
};

export function getManagerDecisionHistory(monitorias: Monitoria[], users: User[]): ManagerDecision[] {
  const managers = new Set(users.filter(user => user.role === 'gestor_suporte').map(user => user.id));
  return monitorias.flatMap(monitoria => (monitoria.history || []).flatMap(entry => {
    const action = entry.action.toLocaleLowerCase('pt-BR');
    const namesManager = /gestor (?:de suporte|de atendimento|pj)/.test(action) || action === 'monitoria aprovada pelo gestor';
    const actedByManager = managers.has(entry.by_id);
    if (!namesManager && !actedByManager) return [];
    let kind: ManagerDecision['kind'] | null = null;
    if (/contest|escalad|devolvid/.test(action)) kind = 'contestation';
    else if (/aprov|aceit/.test(action)) kind = 'approval';
    if (!kind || !entry.at || Number.isNaN(Date.parse(entry.at))) return [];
    return [{ monitoria, entry, kind }];
  })).sort((a, b) => Date.parse(b.entry.at) - Date.parse(a.entry.at));
}
