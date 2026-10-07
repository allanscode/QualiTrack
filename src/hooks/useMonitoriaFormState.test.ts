import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EvaluationForm, Monitoria } from '../types';
import { useMonitoriaFormState } from './useMonitoriaFormState';
import { CHILD_TICKET_FORM_ID } from '../lib/childTicketForm';

describe('useMonitoriaFormState', () => {
  it('preenche a ficha nova a partir da IA e preserva respostas humanas existentes', () => {
    const initialData = {
      form_id: CHILD_TICKET_FORM_ID,
      answers: { 'child-routing-correct': 'NAO' },
      childAiEvaluation: {
        summary: 'Parecer automático', recommendations: [], checks: [
          { question_id: 'child-routing-correct', rule: 'Destino', passed: true, details: 'Destino identificado' },
          { question_id: 'child-parent-linked', rule: 'Pai', passed: true, details: 'Pai vinculado' },
        ],
      },
    } as unknown as Monitoria;
    const { result } = renderHook(() => useMonitoriaFormState(initialData, [], []));
    expect(result.current.scores).toEqual({ 'child-routing-correct': 'NAO', 'child-parent-linked': 'SIM' });
    expect(result.current.observations['child-parent-linked']).toBe('Pai vinculado');
    expect(result.current.header.evaluator_note).toBe('Parecer automático');
    const saved = renderHook(() => useMonitoriaFormState({ ...initialData, id: 'saved' }, [], []));
    expect(saved.result.current.scores).toEqual(initialData.answers);
    expect(saved.result.current.header.evaluator_note).toBe('');
  });
  it('converte ticket_date ISO para YYYY-MM-DD no fuso de São Paulo', () => {
    const { result } = renderHook(() =>
      useMonitoriaFormState(
        { ticket_date: '2026-09-24T01:30:00Z' } as any,
        [],
        []
      )
    );
    expect(result.current.header.ticket_date).toBe('2026-09-23');
  });

  it('mantém ticket_date se já for YYYY-MM-DD', () => {
    const { result } = renderHook(() =>
      useMonitoriaFormState(
        { ticket_date: '2026-09-20' } as any,
        [],
        []
      )
    );
    expect(result.current.header.ticket_date).toBe('2026-09-20');
  });

  it('usa data atual se ticket_date não for informado', () => {
    const { result } = renderHook(() =>
      useMonitoriaFormState(
        undefined,
        [],
        []
      )
    );
    expect(result.current.header.ticket_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('usa a ficha corrigida em vez do snapshot da ficha anterior', () => {
    const oldForm = { id: 'old-form', title: 'Ficha Revenda', sections: [] } as unknown as EvaluationForm;
    const correctedForm = { id: 'corrected-form', title: 'Ficha Cliente Final', sections: [] } as unknown as EvaluationForm;
    const initialData = { form_id: oldForm.id, form_snapshot: oldForm } as Monitoria;
    const { result } = renderHook(() => useMonitoriaFormState(initialData, [oldForm, correctedForm], []));

    expect(result.current.selectedForm?.id).toBe(oldForm.id);
    act(() => result.current.setHeader(previous => ({ ...previous, form_id: correctedForm.id })));
    expect(result.current.selectedForm?.id).toBe(correctedForm.id);
  });

  it('abre reavaliação de filho antigo na ficha própria sem reaproveitar respostas incompatíveis', () => {
    const oldForm = { id: 'regular', title: 'Atendimento', sections: [] } as unknown as EvaluationForm;
    const childForm = { id: CHILD_TICKET_FORM_ID, title: 'Ticket Filho', sections: [] } as unknown as EvaluationForm;
    const initialData = {
      form_id: oldForm.id,
      form_snapshot: { ...oldForm, ticket_kind: 'chamado_filho' },
      answers: { 'old-question': 'SIM' },
      _reevaluate: true,
    } as unknown as Monitoria;
    const { result } = renderHook(() => useMonitoriaFormState(initialData, [oldForm, childForm], []));
    expect(result.current.header.form_id).toBe(CHILD_TICKET_FORM_ID);
    expect(result.current.selectedForm?.id).toBe(CHILD_TICKET_FORM_ID);
    expect(result.current.scores).toEqual({});
  });
});
