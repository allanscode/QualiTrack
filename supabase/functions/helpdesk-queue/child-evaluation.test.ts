import { describe, expect, it } from 'vitest';
import {
  CHILD_QUESTION_IDS, childCreationRoutingEvidence, reconcileChildOpeningRouting,
  validateChildEvaluationResponse,
} from './child-evaluation';

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

describe('destinatário de Nova Demanda no histórico de abertura', () => {
  const creationAudit = (creatorId: number, assigneeId: number) => ({ audits: [{
    author_id: creatorId,
    events: [
      { type: 'Create', field_name: 'assignee_id', value: String(assigneeId) },
      { type: 'Create', field_name: 'group_id', value: '900' },
    ],
  }] });

  const routingFailure = () => ({
    detected_type: 'nova_demanda', status: 'nao_conforme' as const, score: 75,
    summary: 'Grupo e nome foram interpretados como destinatário errado.',
    recommendations: ['Atribuir a si mesmo.'],
    checks: CHILD_QUESTION_IDS.map(question_id => ({
      question_id, rule: 'Critério da ficha', answer: question_id === 'child-routing-correct' ? 'NAO' as const : 'SIM' as const,
      passed: question_id !== 'child-routing-correct', details: 'Parecer da IA.',
    })),
  });

  it('corrige o falso negativo quando o próprio criador era o destinatário inicial', () => {
    const evidence = childCreationRoutingEvidence(creationAudit(71, 71));
    expect(evidence).toMatchObject({ creatorId: 71, initialAssigneeId: 71, initialGroupId: 900, selfAssigned: true });
    const corrected = reconcileChildOpeningRouting(routingFailure(), evidence);
    expect(corrected.status).toBe('conforme');
    expect(corrected.score).toBe(100);
    expect(corrected.checks.find(check => check.question_id === 'child-routing-correct')).toMatchObject({
      answer: 'SIM', passed: true,
    });
    expect(corrected.summary).not.toContain('destinatário errado');
  });

  it('não confunde o grupo exibido com autoatribuição e preserva falha real', () => {
    const evidence = childCreationRoutingEvidence(creationAudit(71, 72));
    const result = routingFailure();
    expect(reconcileChildOpeningRouting(result, evidence)).toBe(result);
    const falsePositive = { ...result, status: 'conforme' as const, score: 100,
      checks: result.checks.map(check => check.question_id === 'child-routing-correct'
        ? { ...check, answer: 'SIM' as const, passed: true } : check) };
    const corrected = reconcileChildOpeningRouting(falsePositive, evidence);
    expect(corrected.status).toBe('nao_conforme');
    expect(corrected.score).toBe(75);
    expect(corrected.checks.find(check => check.question_id === 'child-routing-correct')).toMatchObject({
      answer: 'NAO', passed: false,
    });
  });

  it('corrige Análise Técnica sem apagar outras falhas reais da ficha', () => {
    const result = routingFailure();
    const withTechnicalFailure = { ...result, detected_type: 'analise_tecnica',
      checks: result.checks.map(check => check.question_id === 'child-macro-enriched'
        ? { ...check, answer: 'NAO' as const, passed: false } : check) };
    const corrected = reconcileChildOpeningRouting(withTechnicalFailure,
      childCreationRoutingEvidence(creationAudit(71, 71)));
    expect(corrected.checks.find(check => check.question_id === 'child-routing-correct')).toMatchObject({
      answer: 'SIM', passed: true,
    });
    expect(corrected.checks.find(check => check.question_id === 'child-macro-enriched')).toMatchObject({
      answer: 'NAO', passed: false,
    });
    expect(corrected.status).toBe('nao_conforme');
    expect(corrected.summary).toContain('atribuição inicial do chamado filho ao próprio agente está correta');
  });

  it('não altera o parecer sem histórico confiável ou com tipo desconhecido', () => {
    const result = routingFailure();
    expect(reconcileChildOpeningRouting(result, null)).toBe(result);
    const unknown = { ...result, detected_type: 'desconhecido' };
    expect(reconcileChildOpeningRouting(unknown,
      childCreationRoutingEvidence(creationAudit(71, 71)))).toBe(unknown);
    expect(childCreationRoutingEvidence({ audits: [{ author_id: -1, events: [] }] })).toBeNull();
  });
});
