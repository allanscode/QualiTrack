import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MonitoriaDetails from './MonitoriaDetails';
import type { Monitoria, User } from '../types';

const monitoria = {
  id: 'monitoria-1',
  ticket_id: '99022',
  status: 'pendente_revisao',
  created_at: '2026-09-25T15:05:00.000Z',
  updated_at: '2026-09-25T15:05:00.000Z',
  evaluator_id: 'auditor-1',
  evaluated_id: 'agente-1',
  score: 50,
  history: [{ action: 'Cria??o de Monitoria', by_id: 'auditor-1', by_name: 'Maria Auditora', at: '2026-09-25T15:05:00.000Z' }],
  evaluator_note: 'Requer a??o corretiva.',
  corrective_action: 'Feedback individual aplicado.',
} as Monitoria;

const supportUser = { id: 'agente-1', role: 'suporte', name: 'Jo?o Suporte' } as User;
const managerUser = { id: 'manager-1', role: 'gestor_suporte', name: 'Gestor Suporte' } as User;

function renderDetails(user: User) {
  return render(<MonitoriaDetails monitoria={monitoria} user={user} users={[supportUser, managerUser]} onView={vi.fn()} onAction={vi.fn()} />);
}

describe('MonitoriaDetails', () => {
  it('keeps timeline and notes readable while hiding manager actions from support', () => {
    renderDetails(supportUser);
    expect(screen.getByText('Linha do Tempo')).toBeInTheDocument();
    expect(screen.getByText('Requer a??o corretiva.')).toBeInTheDocument();
    expect(screen.getByText('Feedback individual aplicado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    expect(screen.queryByText('Maria Auditora')).not.toBeInTheDocument();
  });

  it('retains manager approval and contestation controls', () => {
    renderDetails(managerUser);
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contestar' })).toBeInTheDocument();
  });
});
