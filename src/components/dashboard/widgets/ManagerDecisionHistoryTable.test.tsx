import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Monitoria, User } from '../../../types';
import ManagerDecisionHistoryTable from './ManagerDecisionHistoryTable';

vi.mock('../DashboardTileLayout', () => ({ DashboardTile: ({ children }: { children: React.ReactNode }) => children }));

const users = [
  { id: 'manager-1', role: 'gestor_suporte', name: 'Gestor Um' },
  { id: 'manager-2', role: 'gestor_suporte', name: 'Gestor Dois' },
] as User[];

const monitorias = [
  { id: 'a', ticket_id: '177437', evaluated_name: 'Rafaela', team_id: 'team-1', team_name: 'PJ Bruno', status: 'concluida', history: [
    { action: 'Monitoria aprovada pelo Gestor de Suporte', by_id: 'manager-1', by_name: 'Gestor Um', at: '2026-10-06T12:00:00Z' },
  ] },
  { id: 'b', ticket_id: '175307', evaluated_name: 'Ronaldo', team_id: 'team-2', team_name: 'Revenda', status: 'em_contestacao', history: [
    { action: 'Contestação realizada pelo Gestor de Suporte', by_id: 'manager-2', by_name: 'Gestor Dois', at: '2026-10-05T12:00:00Z' },
  ] },
] as Monitoria[];

describe('ManagerDecisionHistoryTable', () => {
  it('filtra por decisão, gestor e ticket', () => {
    render(<ManagerDecisionHistoryTable monitorias={monitorias} users={users} profile="admin" />);
    expect(screen.getByRole('button', { name: '#177437' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#175307' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar decisão'), { target: { value: 'contestation' } });
    expect(screen.queryByRole('button', { name: '#177437' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#175307' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar gestor'), { target: { value: 'manager-1' } });
    expect(screen.queryByRole('button', { name: '#175307' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar decisão'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Buscar decisões'), { target: { value: '177437' } });
    expect(screen.getByRole('button', { name: '#177437' })).toBeInTheDocument();
  });

  it('limita a visão do gestor de atendimento às equipes vinculadas', () => {
    render(<ManagerDecisionHistoryTable monitorias={monitorias} users={users} profile="gestor_suporte" allowedTeamIds={['team-1']} />);
    expect(screen.getByRole('button', { name: '#177437' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '#175307' })).not.toBeInTheDocument();
  });
});
