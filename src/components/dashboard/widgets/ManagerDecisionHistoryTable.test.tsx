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

    fireEvent.change(screen.getByLabelText('Filtrar tipo'), { target: { value: 'contestation' } });
    expect(screen.queryByRole('button', { name: '#177437' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#175307' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Filtrar respons/), { target: { value: 'manager-1' } });
    expect(screen.queryByRole('button', { name: '#175307' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar tipo'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText(/Buscar decis/), { target: { value: '177437' } });
    expect(screen.getByRole('button', { name: '#177437' })).toBeInTheDocument();
  });

  it('limita a visão do gestor de atendimento às equipes vinculadas', () => {
    render(<ManagerDecisionHistoryTable monitorias={monitorias} users={users} profile="gestor_suporte" allowedTeamIds={['team-1']} />);
    expect(screen.getByRole('button', { name: '#177437' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '#175307' })).not.toBeInTheDocument();
  });
  it('mostra decisões da Gestão da Qualidade e reavaliações do monitor de qualidade', () => {
    const qualityUsers = [
      ...users,
      { id: 'quality-manager', role: 'gestor_qualidade', name: 'Gestora Qualidade' },
      { id: 'quality-auditor', role: 'qualidade', name: 'Monitora Qualidade' },
    ] as User[];
    const withQualityDecisions = [
      ...monitorias,
      { id: 'c', ticket_id: '183732', evaluated_name: 'Camila', team_name: 'Revenda', status: 'concluida', history: [
        { action: 'Contestacao validada pela Gestao da Qualidade; decisao final', by_id: 'quality-manager', by_name: 'Gestora Qualidade', at: '2026-10-04T12:00:00Z' },
      ] },
      { id: 'd', ticket_id: '183701', evaluated_name: 'Diego', team_name: 'PJ Bruno', status: 'concluida', history: [
        { action: 'Monitoria Reavaliada (Concluida)', by_id: 'quality-auditor', by_name: 'Monitora Qualidade', at: '2026-10-03T12:00:00Z' },
      ] },
    ] as Monitoria[];
    render(<ManagerDecisionHistoryTable monitorias={withQualityDecisions} users={qualityUsers} profile="gestor_qualidade" />);
    expect(screen.getByRole('button', { name: '#183732' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#183701' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar tipo'), { target: { value: 'reevaluation' } });
    expect(screen.getByRole('button', { name: '#183701' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '#183732' })).not.toBeInTheDocument();
  });
});
