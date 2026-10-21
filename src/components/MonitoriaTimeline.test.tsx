import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Monitoria, User } from '../types';
import MonitoriaTimeline from './MonitoriaTimeline';

const longNote = 'O gestor contestou a avaliação após revisar o atendimento e apontou que a análise técnica seguiu outro fluxo. '.repeat(5);
const monitoria = {
  id: 'monitoria-1', status: 'contestacao_negada', created_at: '2026-10-06T12:00:00Z', updated_at: '2026-10-06T15:00:00Z',
  history: [
    { action: 'Monitoria Criada', by_id: 'auditor-1', by_name: 'Auditor', at: '2026-10-06T12:00:00Z' },
    { action: 'Contestação realizada', by_id: 'gestor-1', by_name: 'Gestor', at: '2026-10-06T13:00:00Z', note: longNote },
  ],
} as Monitoria;

describe('MonitoriaTimeline', () => {
  it('permite ler uma observação longa e mantém a etapa atual após os eventos', () => {
    const user = { id: 'admin-1', role: 'admin', name: 'Admin' } as User;
    render(<MonitoriaTimeline monitoria={monitoria} user={user} users={[user]} />);

    const expand = screen.getByRole('button', { name: 'Ler observação completa' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expand);
    expect(screen.getByRole('button', { name: 'Recolher observação' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Etapa atual/)).toBeInTheDocument();
  });

  it('preserva o anonimato do auditor para a equipe de suporte', () => {
    const support = { id: 'support-1', role: 'suporte', name: 'Agente' } as User;
    const manager = { id: 'gestor-1', role: 'gestor_suporte', name: 'Gestor' } as User;
    render(<MonitoriaTimeline monitoria={monitoria} user={support} users={[support, manager]} />);
    expect(screen.getByText('Equipe de Qualidade')).toBeInTheDocument();
    expect(screen.queryByText('Auditor')).not.toBeInTheDocument();
  });

  it('shows the quality role for legacy administrator-labeled edits by a quality manager', () => {
    const admin = { id: 'admin-1', role: 'admin', name: 'Admin' } as User;
    const qualityManager = { id: 'quality-1', role: 'gestor_qualidade', name: 'Allan' } as User;
    const edited = {
      ...monitoria,
      history: [{ action: 'Edi\u00E7\u00E3o pelo Administrador', by_id: 'quality-1', by_name: 'Allan', at: '2026-10-06T14:00:00Z' }],
    } as Monitoria;
    render(<MonitoriaTimeline monitoria={edited} user={admin} users={[admin, qualityManager]} />);

    expect(screen.getByText('Edi\u00E7\u00E3o pela Gest\u00E3o da Qualidade')).toBeInTheDocument();
    expect(screen.queryByText('Edi\u00E7\u00E3o pelo Administrador')).not.toBeInTheDocument();
  });

  it('mostra conclusão automática quando o histórico não contém evento terminal', () => {
    const user = { id: 'admin-1', role: 'admin', name: 'Admin' } as User;
    render(<MonitoriaTimeline monitoria={{ ...monitoria, status: 'concluida', resolution_type: 'automatic', history: [] }} user={user} users={[user]} />);
    expect(screen.getByText(/Monitoria conclu/)).toBeInTheDocument();
  });
});
