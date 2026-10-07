import type { EvaluationForm, Monitoria, User } from '../types';

export interface CriticalErrorOccurrence {
  id: string;
  label: string;
  monitoria: Monitoria;
}

export interface AgentCriticalErrors {
  agentId: string;
  agentName: string;
  teamName: string;
  auditCount: number;
  affectedCount: number;
  occurrences: CriticalErrorOccurrence[];
}

export function getCriticalErrorOccurrences(monitoria: Monitoria, forms: EvaluationForm[]): CriticalErrorOccurrence[] {
  const form = monitoria.form_snapshot || forms.find(item => item.id === monitoria.form_id);
  const labels = new Map<string, string>();
  form?.sections.forEach(section => section.questions.forEach(question => {
    if (question.is_critical && monitoria.answers?.[question.id] === 'NAO') {
      labels.set(question.id, question.text);
    }
  }));
  const criticalLabels = new Map(form?.critical_errors?.map(error => [error.id, error.text]) || []);
  monitoria.selected_critical_errors?.forEach(id => {
    labels.set(id, criticalLabels.get(id) || labels.get(id) || `Erro crítico ${id}`);
  });
  return [...labels].map(([id, label]) => ({ id, label, monitoria }));
}

export function getAgentCriticalErrors(monitorias: Monitoria[], forms: EvaluationForm[], users: User[]): AgentCriticalErrors[] {
  const agents = new Map<string, AgentCriticalErrors>();
  monitorias.filter(item => item.active !== false).forEach(monitoria => {
    const agentId = monitoria.evaluated_id || `name:${monitoria.evaluated_name || monitoria.id}`;
    const user = users.find(item => item.id === monitoria.evaluated_id);
    const existing = agents.get(agentId) || {
      agentId,
      agentName: monitoria.evaluated_name || user?.name || 'Agente não identificado',
      teamName: monitoria.team_name || '',
      auditCount: 0,
      affectedCount: 0,
      occurrences: [],
    };
    existing.auditCount += 1;
    const occurrences = getCriticalErrorOccurrences(monitoria, forms);
    if (occurrences.length) existing.affectedCount += 1;
    existing.occurrences.push(...occurrences);
    agents.set(agentId, existing);
  });
  return [...agents.values()].filter(item => item.occurrences.length > 0)
    .sort((a, b) => b.occurrences.length - a.occurrences.length || b.affectedCount - a.affectedCount || a.agentName.localeCompare(b.agentName, 'pt-BR'));
}
