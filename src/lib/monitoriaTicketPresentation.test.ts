import { expect, it } from 'vitest';
import { monitoriaTicketPresentation } from './monitoriaTicketPresentation';
import { CHILD_TICKET_FORM_ID } from './childTicketForm';
import type { Monitoria, Team } from '../types';

it('separates ticket group from management team and identifies child tickets', () => {
  const row = { id: 'm', form_id: CHILD_TICKET_FORM_ID, team_id: 'pj', team_name: 'PJ Trindade',
    ticket_group_team_id: 'cf' } as Monitoria;
  expect(monitoriaTicketPresentation(row, [{ id: 'cf', name: 'Cliente Final' } as Team], {
    monitoria_id: 'm', ticket_subject: 'Falha no PDV', ticket_group_name: null,
  })).toEqual({ type: 'Ticket filho', category: null, subject: 'Falha no PDV', group: 'Cliente Final' });
  expect(monitoriaTicketPresentation({ ...row, ticket_group_team_id: undefined }).group).toBeNull();
});
