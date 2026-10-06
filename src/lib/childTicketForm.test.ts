import { describe, expect, it } from 'vitest';
import type { EvaluationForm, Monitoria } from '../types';
import { CHILD_TICKET_FORM_ID, childTicketForm, shouldUseChildFormForReevaluation } from './childTicketForm';

describe('ficha de ticket filho', () => {
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
