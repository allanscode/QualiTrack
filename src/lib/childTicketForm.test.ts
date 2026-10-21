import { describe, expect, it } from 'vitest';
import type { ChildTicketAiEvaluation, EvaluationForm, Monitoria } from '../types';
import { CHILD_FORM_IDS, CHILD_TICKET_FORM_ID, childEvaluationFormPrefill, childTicketForm, childVerdict, isChildTicketMonitoria, legacyChildNoteVerdict, shouldUseChildFormForReevaluation } from './childTicketForm';

describe('ficha de ticket filho', () => {
  it('childVerdict trata NA como não reprovação e exige todas as respostas', () => {
    const form = { sections: [{ questions: [{ id: 'a' }, { id: 'b' }] }] } as unknown as EvaluationForm;
    expect(childVerdict({ a: 'SIM', b: 'NA' }, form)).toBe('valido');
    expect(childVerdict({ a: 'NAO', b: 'NA' }, form)).toBe('invalido');
    expect(childVerdict({ a: 'SIM' } as Record<string, 'SIM'>, form)).toBeNull();
  });

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

  it('usa uma ficha única de critérios para qualquer tipo de chamado filho', () => {
    const macroForm = { ...child, id: CHILD_FORM_IDS.nova_demanda };
    expect(childTicketForm([regular, macroForm, child])).toBe(child);
    expect(childTicketForm([regular, macroForm])).toBeUndefined();
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

  it('reconhece snapshots antigos de automacao/veredito de filho com form_id legado', () => {
    const legacyForm = { form_id: 'legacy-form', form_snapshot: { automation: 'child_ticket' } } as unknown as Monitoria;
    const binarySnapshot = { form_id: 'legacy-form', form_snapshot: { child_verdict: 'invalido' } } as unknown as Monitoria;
    expect(isChildTicketMonitoria(legacyForm)).toBe(true);
    expect(isChildTicketMonitoria(binarySnapshot)).toBe(true);
  });

  it('identifica o veredito histórico sem inferi-lo da nota numérica', () => {
    const legacy = { form_snapshot: { legacy_source: 'zendesk_child_note', legacy_verdict: 'invalido' }, score: 85 } as unknown as Monitoria;
    expect(legacyChildNoteVerdict(legacy)).toBe('invalido');
    expect(legacyChildNoteVerdict({ ...legacy, form_snapshot: { legacy_verdict: 'invalido' } as unknown as EvaluationForm })).toBeNull();
  });
  it('reconhece snapshots antigos de automacao/veredito de filho com form_id legado', () => {
    const legacyForm = { form_id: 'legacy-form', form_snapshot: { automation: 'child_ticket' } } as unknown as Monitoria;
    const binarySnapshot = { form_id: 'legacy-form', form_snapshot: { child_verdict: 'invalido' } } as unknown as Monitoria;
    expect(isChildTicketMonitoria(legacyForm)).toBe(true);
    expect(isChildTicketMonitoria(binarySnapshot)).toBe(true);
  });
});
