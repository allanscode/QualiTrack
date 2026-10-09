export function normalizeQueueSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}

export function matchesQueueSearchText(
  ticket: { ticket_id: string; subject: string; agent_name?: string | null; requester_name?: string | null },
  term: string,
): boolean {
  const query = normalizeQueueSearchText(term);
  return !query || [ticket.ticket_id, ticket.subject, ticket.agent_name, ticket.requester_name]
    .some(value => Boolean(value && normalizeQueueSearchText(value).includes(query)));
}
