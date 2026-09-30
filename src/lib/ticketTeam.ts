import type { AuditingQueueTicket, User } from '../types';

/** A equipe do atendimento pertence ao ticket; o cadastro do agente é apenas fallback. */
export function resolveTicketTeamId(
  ticket: Pick<AuditingQueueTicket, 'ticket_group_team_id' | 'team_id'>,
  agent?: Pick<User, 'primary_team_id' | 'team_ids'>,
): string | undefined {
  return ticket.ticket_group_team_id || ticket.team_id || agent?.primary_team_id || agent?.team_ids?.[0];
}

/** Exceção restrita ao agente e ao grupo que vieram do mesmo ticket verificado. */
export function isVerifiedTicketGroupPair(
  ticketId: string | undefined,
  originalTicketId: string | undefined,
  agentId: string | undefined,
  originalAgentId: string | undefined,
  teamId: string | undefined,
  ticketGroupTeamId: string | undefined,
): boolean {
  return !!ticketGroupTeamId && !!originalTicketId && ticketId === originalTicketId
    && !!originalAgentId && agentId === originalAgentId && teamId === ticketGroupTeamId;
}
