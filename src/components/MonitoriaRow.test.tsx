import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Monitoria } from '../types';
import { MonitoriaRow } from './MonitoriaRow';

vi.mock('./ui/ActionDeadlineClock', () => ({ default: () => null }));

const monitoria = {
  id: 'm-1', form_id: 'regular', evaluator_id: 'auditor', evaluated_id: 'agente',
  ticket_id: '173388', channel: 'Email', ticket_date: '2026-10-05', analysis_date: '2026-10-06',
  satisfaction_result: null, satisfaction_has_record: false, answers: {}, score: 76.25,
  status: 'concluida', history: [], created_at: '2026-10-06T12:00:00Z', updated_at: '2026-10-06T12:00:00Z',
} as Monitoria;

function row(item: Monitoria) {
  return render(<MonitoriaRow monitoria={item} teams={[]} getName={id => id}
    getLevelForScore={() => ({ color: 'text-green-500' })} onOpen={vi.fn()} />);
}

describe('identificação de ticket filho na lista', () => {
  it('mostra o selo depois do número para monitoria antiga marcada como filho', () => {
    row({ ...monitoria, form_snapshot: { ticket_kind: 'chamado_filho' } as unknown as Monitoria['form_snapshot'] });
    expect(screen.getByText('173388').nextElementSibling).toHaveTextContent('Ticket filho');
  });

  it('não marca atendimento com bloco de IA de filho herdado por engano', () => {
    row({ ...monitoria, form_snapshot: { child_ai_evaluation: {} } as unknown as Monitoria['form_snapshot'] });
    expect(screen.queryByText('Ticket filho')).not.toBeInTheDocument();
  });
});
