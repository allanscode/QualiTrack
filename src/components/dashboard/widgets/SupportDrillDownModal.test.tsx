import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SupportDrillDownContent } from './SupportDrillDownModal';
import { CHILD_TICKET_FORM_ID } from '../../../lib/childTicketForm';
import type { Monitoria } from '../../../types';

afterEach(cleanup);
it('shows and searches ticket type, subject and group without confusing management team', () => {
  const onNavigate = vi.fn();
  render(<SupportDrillDownContent title="Melhores suportes" onClose={vi.fn()} onNavigateToMonitoria={onNavigate}
    monitorias={[{ id: 'monitoria', ticket_id: '181361', form_id: CHILD_TICKET_FORM_ID,
      ticket_subject: 'Erro no fechamento do PDV', ticket_group_name: 'Cliente Final', team_name: 'PJ Trindade',
      evaluated_name: 'Davi Silva', score: 100, status: 'concluida', created_at: '2026-10-13T10:00:00Z' } as Monitoria]} />);
  expect(screen.getByText('Ticket filho')).toBeVisible();
  expect(screen.getByText('Erro no fechamento do PDV')).toBeVisible();
  expect(screen.getByText(/Equipe do agente: PJ Trindade/)).toBeVisible();
  for (const term of ['fechamento', 'Cliente Final', 'ticket filho']) {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: term } });
    expect(screen.getByRole('button', { name: 'Ver' })).toBeVisible();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
  expect(onNavigate).toHaveBeenCalledWith('monitoria', '181361');
});
