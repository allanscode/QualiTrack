import type { EvaluationForm, Monitoria, Team } from '../types';
import { isChildTicketMonitoria } from './childTicketForm';
import type { MonitoriaTicketContext } from '../hooks/useMonitoriaTicketContext';

export type TicketFormSnapshot = EvaluationForm & { ticket_subject?: string; ticket_group_name?: string };

export function monitoriaTicketPresentation(row: Monitoria, groups: Team[] = [], context?: MonitoriaTicketContext) {
  const snapshot = row.form_snapshot as TicketFormSnapshot | undefined;
  const child = isChildTicketMonitoria(row);
  return {
    type: child ? 'Ticket filho' : 'Atendimento',
    category: child ? null : row.satisfaction_result === 'Positiva' ? 'CSAT positiva'
      : row.satisfaction_result === 'Negativa' ? 'CSAT negativa'
        : row.satisfaction_result === 'Sem pesquisa' ? 'Proativa' : null,
    subject: row.ticket_subject?.trim() || snapshot?.ticket_subject?.trim() || context?.ticket_subject?.trim() || null,
    group: row.ticket_group_name?.trim() || snapshot?.ticket_group_name?.trim()
      || groups.find(group => group.id === row.ticket_group_team_id)?.name
      || context?.ticket_group_name?.trim() || null,
  };
}
