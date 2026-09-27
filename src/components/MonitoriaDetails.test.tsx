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

  it('allows administrator to execute governance and workflow actions across different stages', () => {
    const adminUser = { id: 'admin-1', role: 'admin', name: 'Admin Master' } as User;

    // Em contestação
    const contestada = { ...monitoria, status: 'em_contestacao' } as Monitoria;
    const { unmount: unmount1 } = render(
      <MonitoriaDetails monitoria={contestada} user={adminUser} users={[supportUser, managerUser, adminUser]} onView={vi.fn()} onAction={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Reavaliar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Avançar Etapa/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retroceder Etapa/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alterar Etapa/i })).toBeInTheDocument();
    unmount1();

    // Aguardando gestor de suporte
    const aguardandoSuporte = { ...monitoria, status: 'aguardando_gestor_suporte' } as Monitoria;
    const { unmount: unmount2 } = render(
      <MonitoriaDetails monitoria={aguardandoSuporte} user={adminUser} users={[supportUser, managerUser, adminUser]} onView={vi.fn()} onAction={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escalar' })).toBeInTheDocument();
    unmount2();

    // Concluída por SLA
    const concluidaSla = { ...monitoria, status: 'concluida', resolution_type: 'automatic' } as Monitoria;
    render(
      <MonitoriaDetails monitoria={concluidaSla} user={adminUser} users={[supportUser, managerUser, adminUser]} onView={vi.fn()} onAction={vi.fn()} />
    );
    expect(screen.getByText(/Finalizada por SLA \(Decurso de Prazo\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reabrir/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Avaliação' })).toBeInTheDocument();
  }, 15000);
});
