export const MISSING_TICKET_GROUP = '__missing_ticket_group__';

export function matchesTicketGroup(row: { ticket_group_team_id?: string | null }, groupId?: string): boolean {
  return !groupId || (groupId === MISSING_TICKET_GROUP
    ? !row.ticket_group_team_id : row.ticket_group_team_id === groupId);
}
