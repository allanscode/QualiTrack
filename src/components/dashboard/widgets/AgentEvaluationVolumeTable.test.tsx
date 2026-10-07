import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Monitoria } from '../../../types';
import { CHILD_TICKET_FORM_ID } from '../../../lib/childTicketForm';
import AgentEvaluationVolumeTable from './AgentEvaluationVolumeTable';

vi.mock('../DashboardTileLayout', () => ({ DashboardTile: ({ children }: { children: React.ReactNode }) => children }));
const rows = (agent: string, result: Monitoria['satisfaction_result'], count: number): Monitoria[] => Array.from({ length: count }, (_, i) => ({
  id: `${agent}-${result}-${i}`, evaluated_id: agent, evaluated_name: agent, team_name: 'Equipe A', satisfaction_result: result, score: 80, form_id: 'regular',
} as Monitoria));
const data = [...rows('Ana', 'Positiva', 4), ...rows('Bruno', 'Negativa', 5), ...rows('Caio', 'Sem pesquisa', 6)];

describe('AgentEvaluationVolumeTable', () => {
  it('identifies child tickets separately from unclassified records', () => {
    const child = { ...rows('Ana', null, 1)[0], form_id: CHILD_TICKET_FORM_ID };
    render(<AgentEvaluationVolumeTable monitorias={[child]} users={[]} profile="admin" />);
    expect(screen.getByRole('columnheader', { name: 'Tickets filhos' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Sem classificação' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Outras' })).not.toBeInTheDocument();
  });
  it('changes the ranking through every sort control and reverses direction', () => {
    const { container } = render(<AgentEvaluationVolumeTable monitorias={data} users={[]} profile="admin" />);
    const first = () => container.querySelector('tbody tr');
    expect(first()).toHaveTextContent('Caio');
    for (const [value, name] of [['negative', 'Bruno'], ['positive', 'Ana'], ['proactive', 'Caio'], ['total', 'Caio']]) {
      fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar avaliações por' }), { target: { value } });
      expect(first()).toHaveTextContent(name);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar do menor para o maior' }));
    expect(first()).toHaveTextContent('Ana');
    expect(screen.getByRole('columnheader', { name: 'Total' })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('searches agents, totals matching data and reacts to updated dashboard filters', () => {
    const { rerender } = render(<AgentEvaluationVolumeTable monitorias={data} users={[]} profile="admin" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar agente ou equipe' }), { target: { value: 'Bruno' } });
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
    expect(screen.getByText(/1 agente · 5 avaliações/)).toBeInTheDocument();
    rerender(<AgentEvaluationVolumeTable monitorias={rows('Ana', 'Positiva', 1)} users={[]} profile="admin" />);
    expect(screen.getByText(/Nenhuma avaliação encontrada/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar agente ou equipe' }), { target: { value: '' } });
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('Bruno')).not.toBeInTheDocument();
  });

  it('paginates all agents and keeps totals across pages, with unclassified records visible', () => {
    const many = Array.from({ length: 12 }, (_, i) => rows(`Agente ${String(i).padStart(2, '0')}`, null, 1)).flat();
    render(<AgentEvaluationVolumeTable monitorias={many} users={[]} profile="admin" />);
    expect(screen.getByRole('columnheader', { name: 'Sem classificação' })).toBeInTheDocument();
    expect(screen.getByText(/12 agentes · 12 avaliações/)).toBeInTheDocument();
    expect(screen.queryByText('Agente 11')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Agente 11')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Total dos agentes encontrados/ })).getAllByRole('cell').at(-1)).toHaveTextContent('12');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'negative' } });
    expect(screen.getByText('Agente 00')).toBeInTheDocument();
  });

  it('provides an explicit customization preview limited to one team for support managers', () => {
    render(<AgentEvaluationVolumeTable monitorias={[]} users={[]} profile="gestor_suporte" isCustomizing />);
    expect(screen.getByText(/Prévia ilustrativa/)).toBeInTheDocument();
    expect(screen.queryByText('Equipe B')).not.toBeInTheDocument();
  });
});
