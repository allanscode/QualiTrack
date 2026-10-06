import { describe, expect, it } from 'vitest';
import type { EvaluationForm, Monitoria, User } from '../types';
import { getAgentCriticalErrors, getCriticalErrorOccurrences } from './criticalErrors';

const form = {
  id: 'form-1', sections: [{ id: 'section', title: 'Atendimento', questions: [
    { id: 'q-1', text: 'Falha crítica no processo', type: 'yes_no_na', is_critical: true },
    { id: 'q-2', text: 'Falha comum', type: 'yes_no_na', is_critical: false },
  ] }], critical_errors: [{ id: 'c-1', text: 'Exposição de dados', type: 'yes_no_na' }],
} as EvaluationForm;
const base = {
  id: 'm-1', form_id: 'form-1', evaluated_id: 'agent-1', evaluated_name: 'Ana', ticket_id: '123',
  answers: { 'q-1': 'NAO', 'q-2': 'NAO' }, selected_critical_errors: ['c-1', 'c-1'],
  score: 0, active: true, form_snapshot: form,
} as unknown as Monitoria;

describe('criticalErrors', () => {
  it('soma critérios críticos reprovados e erros marcados, sem duplicar a mesma ocorrência', () => {
    expect(getCriticalErrorOccurrences(base, []).map(item => item.label)).toEqual(['Falha crítica no processo', 'Exposição de dados']);
  });

  it('usa o texto histórico da ficha e não infere erro crítico somente pela nota', () => {
    const currentForm = { ...form, sections: [{ ...form.sections[0], questions: [{ ...form.sections[0].questions[0], text: 'Nome alterado' }] }] };
    expect(getCriticalErrorOccurrences(base, [currentForm])[0].label).toBe('Falha crítica no processo');
    expect(getCriticalErrorOccurrences({ ...base, answers: {}, selected_critical_errors: [], score: 0 }, [form])).toEqual([]);
  });

  it('ordena agentes por ocorrências e ignora monitorias inativas', () => {
    const other = { ...base, id: 'm-2', evaluated_id: 'agent-2', evaluated_name: 'Bruno', selected_critical_errors: [] };
    const ranking = getAgentCriticalErrors([base, { ...base, id: 'm-3' }, other, { ...base, id: 'm-4', active: false }], [form], [] as User[]);
    expect(ranking.map(item => [item.agentName, item.occurrences.length, item.affectedCount])).toEqual([
      ['Ana', 4, 2], ['Bruno', 1, 1],
    ]);
  });
});
