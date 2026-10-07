import { describe, expect, it } from 'vitest';
import type { ChildTicketAiEvaluation, EvaluationForm, Monitoria } from '../types';
import { CHILD_TICKET_FORM_ID, childEvaluationFormPrefill, childTicketForm, shouldUseChildFormForReevaluation } from './childTicketForm';

describe('ficha de ticket filho', () => {
  it('preenche resultados por ID e preserva NA sem converter em reprovação', () => {
    const mapped = childEvaluationFormPrefill({
      detected_type: 'analise_tecnica', status: 'atencao', score: 50,
      summary: 'Parecer', recommendations: ['Revisar evidências'],
      checks: [
        { question_id: 'child-parent-linked', rule: 'Pai', passed: true, answer: 'SIM', details: 'Pai 123 vinculado' },
        { question_id: 'child-macro-enriched', rule: 'Evidências', passed: false, answer: 'NA', details: 'Sem evidências suficientes' },
        { question_id: 'unknown', rule: 'Outra regra', passed: true, details: 'Ignorar' },
      ],
    } as ChildTicketAiEvaluation);
    expect(mapped.answers).toEqual({ 'child-parent-linked': 'SIM', 'child-macro-enriched': 'NA' });
    expect(mapped.question_observations['child-parent-linked']).toBe('Pai 123 vinculado');
    expect(mapped.evaluator_note).toBe('Parecer\n\nRevisar evidências');
  });

  it('recupera checks antigos sem supor vínculo com pai ou suficiência técnica', () => {
    const mapped = childEvaluationFormPrefill({
      detected_type: 'analise_tecnica', status: 'nao_conforme', score: 60,
      summary: '', recommendations: [], checks: [
        { rule: 'Assunto da Abertura e Macro de Resolvido', passed: true, details: 'Assunto válido' },
        { rule: 'Preservação do Texto da Macro', passed: false, details: 'Texto removido' },
        { rule: "Direcionamento Correto ('Para')", passed: true, details: 'N2 correto' },
      ],
    } as ChildTicketAiEvaluation);
    expect(mapped.answers).toEqual({ 'child-subject-preserved': 'SIM', 'child-macro-preserved': 'NAO', 'child-routing-correct': 'SIM' });
  });
  const child = { id: CHILD_TICKET_FORM_ID, active: true } as EvaluationForm;
  const regular = { id: 'regular', active: true } as EvaluationForm;

  it('seleciona a rubrica própria para tickets filhos', () => {
    expect(childTicketForm([regular, child])).toBe(child);
    expect(childTicketForm([regular])).toBeUndefined();
  });

  it('corrige a ficha na reavaliação de monitoria antiga de filho', () => {
    const previous = {
      form_id: regular.id,
      form_snapshot: { ...regular, ticket_kind: 'chamado_filho' },
      _reevaluate: true,
    } as unknown as Monitoria;
    expect(shouldUseChildFormForReevaluation(previous)).toBe(true);
    expect(shouldUseChildFormForReevaluation({ ...previous, _reevaluate: false } as Monitoria)).toBe(false);
    expect(shouldUseChildFormForReevaluation({
      ...previous,
      form_snapshot: { ...regular, child_ai_evaluation: { checks: [] } },
    } as Monitoria)).toBe(false);
  });
});
