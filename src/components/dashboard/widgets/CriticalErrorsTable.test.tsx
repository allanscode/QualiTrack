import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EvaluationForm, Monitoria, User } from '../../../types';
import CriticalErrorsTable from './CriticalErrorsTable';

vi.mock('../DashboardTileLayout', () => ({ DashboardTile: ({ children }: { children: React.ReactNode }) => children }));

const form = { id: 'form', sections: [{ id: 'section', title: 'Atendimento', questions: [
  { id: 'q1', text: 'Procedimento crítico', is_critical: true, type: 'yes_no_na' },
] }], critical_errors: [{ id: 'c1', text: 'Exposição de dados', type: 'yes_no_na' }] } as EvaluationForm;
const monitorias = [
  { id: 'm1', ticket_id: '101', form_id: 'form', evaluated_id: 'a1', evaluated_name: 'Ana', answers: { q1: 'NAO' }, selected_critical_errors: ['c1'], form_snapshot: form },
  { id: 'm2', ticket_id: '202', form_id: 'form', evaluated_id: 'a2', evaluated_name: 'Bruno', answers: { q1: 'NAO' }, form_snapshot: form },
] as unknown as Monitoria[];

describe('CriticalErrorsTable', () => {
  it('filtra por erro e abre a avaliação correspondente', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    render(<CriticalErrorsTable monitorias={monitorias} forms={[form]} users={[] as User[]} profile="admin" />);
    fireEvent.change(screen.getByLabelText('Filtrar erro crítico'), { target: { value: 'c1' } });
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('Bruno')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ver avaliações/ }));
    fireEvent.click(screen.getByRole('button', { name: /#101/ }));
    const event = dispatch.mock.calls.at(-1)?.[0] as CustomEvent;
    expect(event.type).toBe('qualitrack:focus_monitoria');
    expect(event.detail).toEqual({ monitoriaId: 'm1', ticketId: '101' });
    dispatch.mockRestore();
  });

  it('mostra uma amostra restrita na personalização do gestor', () => {
    render(<CriticalErrorsTable monitorias={[]} forms={[]} users={[]} profile="gestor_suporte" isCustomizing />);
    expect(screen.getByText('Agente exemplo A')).toBeInTheDocument();
    expect(screen.queryByText('Agente exemplo B')).not.toBeInTheDocument();
  });
});
