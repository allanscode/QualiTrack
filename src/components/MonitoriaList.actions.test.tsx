import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MonitoriaList from './MonitoriaList';
import type { Monitoria, User } from '../types';

vi.unmock('motion/react');

const { updateMonitoria, publishEvaluation, observedSearch, fixture } = vi.hoisted(() => ({
  updateMonitoria: vi.fn(), publishEvaluation: vi.fn(), observedSearch: vi.fn(),
  fixture: { status: 'em_contestacao', loading: false },
}));
vi.mock('../lib/supabase', () => ({ supabase: null, isMockMode: true, mockDb: { update: updateMonitoria } }));
vi.mock('../lib/helpdesk', () => ({ publishEvaluationToHelpdesk: publishEvaluation, getLatestHelpdeskSubmission: vi.fn() }));
vi.mock('../lib/StaticDataContext', () => ({
  useStaticData: () => ({ users: [], teams: [], forms: [] }),
}));
vi.mock('../lib/useQualityConfig', () => ({
  useQualityConfig: () => ({ config: {
    action_deadline: { agent_review: 50, auditor_reevaluation: 25, manager_support: 25, manager_quality: 25 },
    businessHours: { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5], holidays: [] },
  }, getLevelForScore: () => ({ color: 'text-level-ruim' }) }),
}));
vi.mock('../hooks/useMonitoriaData', () => ({
  useMonitoriaData: (_user: unknown, _tab: unknown, options: { filters: { search: string } }) => {
    observedSearch(options.filters.search);
    return { monitorias: [{
    id: 'monitoria-1', display_id: 5786, ticket_id: '167240', status: fixture.status,
    active: true, created_at: '2026-09-22T11:14:00.000Z', updated_at: '2026-09-25T15:21:00.000Z',
    evaluator_id: 'auditor-1', evaluated_id: 'agente-1', score: 50,
    history: [{ action: 'Contestação realizada', by_id: 'admin-1', by_name: 'Administrador', at: '2026-09-25T15:21:00.000Z' }],
    evaluator_note: 'Observação da qualidade',
  } as Monitoria], total: 1, loading: fixture.loading, load: vi.fn(), fetchDetail: vi.fn().mockImplementation(async () => ({
    id: 'monitoria-1', display_id: 5786, ticket_id: '167240', status: fixture.status,
    active: true, created_at: '2026-09-22T11:14:00.000Z', updated_at: '2026-09-25T15:21:00.000Z',
    evaluator_id: 'auditor-1', evaluated_id: 'agente-1', score: 50,
    history: [{ action: 'Contestação realizada', by_id: 'admin-1', by_name: 'Administrador', at: '2026-09-25T15:21:00.000Z' }],
    evaluator_note: 'Observação da qualidade',
  } as Monitoria)) };
  },
}));
vi.mock('../hooks/useFeedbacks', () => ({ useFeedbacks: () => ({ feedbacks: [] }) }));
vi.mock('./MonitoriaForm', () => ({ default: () => <div>Ficha de avaliação</div> }));

const admin = { id: 'admin-1', role: 'admin', name: 'Administrador' } as User;
HTMLElement.prototype.scrollIntoView = vi.fn();

function ListWithSelectedMonitoria() {
  const [focusTarget, setFocusTarget] = useState<{ monitoriaId: string } | null>({ monitoriaId: 'monitoria-1' });
  return <MonitoriaList user={admin} activeTab="monitorias" initialFocusTarget={focusTarget} onClearFocusTarget={() => setFocusTarget(null)} />;
}

describe('MonitoriaList actions', () => {
  beforeEach(() => {
    fixture.status = 'em_contestacao';
    fixture.loading = false;
    observedSearch.mockClear();
    updateMonitoria.mockReset();
    updateMonitoria.mockResolvedValue({ data: null });
    publishEvaluation.mockReset();
    publishEvaluation.mockResolvedValue({ success: true });
  });

  it('busca somente após Pesquisar e mantém o campo montado durante a consulta', async () => {
    const view = render(<MonitoriaList user={admin} activeTab="monitorias" />);
    const input = screen.getByRole('searchbox', { name: 'Buscar monitoria' });
    fireEvent.change(input, { target: { value: '178524' } });
    expect(input).toHaveValue('178524');
    expect(observedSearch.mock.calls.at(-1)?.[0]).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
    await waitFor(() => expect(observedSearch.mock.calls.at(-1)?.[0]).toBe('178524'));
    fixture.loading = true;
    view.rerender(<MonitoriaList user={admin} activeTab="monitorias" />);
    expect(screen.getByRole('searchbox', { name: 'Buscar monitoria' })).toHaveValue('178524');
    expect(screen.getByText('Buscando monitorias...')).toBeInTheDocument();
  });

  it('envia o registro ao Zendesk depois da aprovação final pela Qualidade', async () => {
    fixture.status = 'aguardando_gestor_qualidade';
    render(<ListWithSelectedMonitoria />);
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByText('Registro do Auditor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Ação' }));
    await waitFor(() => expect(updateMonitoria).toHaveBeenCalledWith(
      'monitorias', 'monitoria-1', expect.objectContaining({ status: 'concluida' })
    ));
    await waitFor(() => expect(publishEvaluation).toHaveBeenCalledWith('monitoria-1'));
  });

  it('permite conferir o envio de uma monitoria já concluída', async () => {
    fixture.status = 'concluida';
    render(<ListWithSelectedMonitoria />);
    fireEvent.click(await screen.findByRole('button', { name: 'Conferir envio ao Zendesk' }));
    expect(await screen.findByText('Enviar ao Zendesk')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Monitoria/ })).not.toBeInTheDocument();
  });

  it.each([
    ['Recusar', 'Recusar Contestação', 'contestacao_negada'],
    ['Retroceder Etapa', 'Retroceder Etapa', 'pendente_revisao'],
    ['Avançar Etapa', 'Avançar Etapa', 'aguardando_gestor_suporte'],
    ['Alterar Etapa', 'Alterar Etapa da Monitoria', 'aguardando_gestor_suporte'],
  ])('confirms and saves %s', async (button, title, expectedStatus) => {
    render(<ListWithSelectedMonitoria />);
    fireEvent.click(await screen.findByRole('button', { name: button }));
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Ação' }));
    await waitFor(() => expect(updateMonitoria).toHaveBeenCalledWith(
      'monitorias', 'monitoria-1', expect.objectContaining({ status: expectedStatus })
    ));
  });
});
