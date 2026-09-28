import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InPlaceMonitoriaModal from './InPlaceMonitoriaModal';
import type { Monitoria, User } from '../types';

vi.unmock('motion/react');

const { getMonitorias, updateMonitoria } = vi.hoisted(() => ({
  getMonitorias: vi.fn(),
  updateMonitoria: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: null,
  isMockMode: true,
  mockDb: { get: getMonitorias, update: updateMonitoria },
}));

vi.mock('../lib/useQualityConfig', () => ({
  useQualityConfig: () => ({ config: {
    action_deadline: { agent_review: 50, auditor_reevaluation: 25, manager_support: 25, manager_quality: 25 },
    businessHours: { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5], holidays: [] },
  } }),
}));

vi.mock('./MonitoriaForm', () => ({ default: () => <div>Ficha de avaliação</div> }));

const admin = { id: 'admin-1', role: 'admin', name: 'Administrador' } as User;
const monitoria = {
  id: 'monitoria-1', display_id: 5786, ticket_id: '167240', status: 'reavaliacao_solicitada',
  active: true, created_at: '2026-09-22T11:14:00.000Z', updated_at: '2026-09-25T15:21:00.000Z',
  evaluator_id: 'auditor-1', evaluated_id: 'agente-1', score: 50,
  history: [{ action: 'Contestação realizada', by_id: 'admin-1', by_name: 'Administrador', at: '2026-09-25T15:21:00.000Z' }],
  evaluator_note: 'Observação da qualidade',
} as Monitoria;

describe('InPlaceMonitoriaModal actions', () => {
  beforeEach(() => {
    getMonitorias.mockReset();
    updateMonitoria.mockReset();
    getMonitorias.mockResolvedValue({ data: [monitoria] });
    updateMonitoria.mockResolvedValue({ data: monitoria });
  });

  it.each([
    ['Retroceder Etapa', 'Retroceder Etapa'],
    ['Avançar Etapa', 'Avançar Etapa'],
    ['Alterar Etapa', 'Alterar Etapa da Monitoria'],
  ])('opens confirmation for %s', async (button, title) => {
    render(<InPlaceMonitoriaModal monitoriaId={monitoria.id} user={admin} users={[admin]} teams={[]} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: button }));
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Ação' }));
    await waitFor(() => expect(updateMonitoria).toHaveBeenCalled());
  });
});
