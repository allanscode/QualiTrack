import { describe, expect, it } from 'vitest';
import { CHILD_QUESTION_IDS, validateChildEvaluationResponse } from './child-evaluation';

const evaluation = () => ({
  detected_type: 'nova_demanda', status: 'atencao', score: 100,
  summary: 'Vínculo precisa ser conferido.', recommendations: [],
  checks: CHILD_QUESTION_IDS.map(question_id => ({
    question_id, rule: 'Critério da ficha',
    answer: question_id === 'child-parent-linked' ? 'NA' : 'SIM',
    passed: question_id !== 'child-parent-linked',
    details: question_id === 'child-parent-linked' ? 'Vínculo não informado nos dados disponíveis.' : 'Conformidade demonstrada no chamado.',
  })),
});

describe('resposta de IA para ficha de chamado filho', () => {
  it('aceita os cinco critérios, incluindo evidência insuficiente explícita', () => {
    const result = evaluation();
    expect(validateChildEvaluationResponse(result)).toBe(result);
  });

  it('rejeita critérios faltantes, duplicados ou desconhecidos', () => {
    const missing = evaluation();
    missing.checks.pop();
    expect(() => validateChildEvaluationResponse(missing)).toThrow();
    const duplicate = evaluation();
    duplicate.checks[1] = duplicate.checks[0];
    expect(() => validateChildEvaluationResponse(duplicate)).toThrow();
    const unknown = evaluation();
    unknown.checks[0].question_id = 'outro';
    expect(() => validateChildEvaluationResponse(unknown)).toThrow();
  });

  it('rejeita resposta sem fundamentação ou aprovação contraditória', () => {
    const blank = evaluation();
    blank.checks[0].details = ' ';
    expect(() => validateChildEvaluationResponse(blank)).toThrow();
    const contradiction = evaluation();
    contradiction.checks[1].passed = true;
    expect(() => validateChildEvaluationResponse(contradiction)).toThrow();
    expect(() => validateChildEvaluationResponse({ ...evaluation(), checks: null })).toThrow();
  });
});
