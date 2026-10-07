export type QueueType = 'negativas' | 'positivas' | 'proativas' | 'filhos' | 'filhos_invalidos';

const AUDIT_ACTIONS = new Set(['evaluate_ai', 'evaluate_child_ticket', 'generate_auditor_record', 'resolve_agent', 'fetch_draft_statuses', 'publish_child_macro']);

export function canRunQueueAction(role: string, action: string): boolean {
  return !AUDIT_ACTIONS.has(action) || role === 'qualidade' || role === 'gestor_qualidade' || role === 'admin';
}

export function shouldMergeRecentQueueSnapshot(
  queueType: QueueType,
  cursor: string | null | undefined,
  searchTerm?: string,
): boolean {
  return (queueType === 'negativas' || queueType === 'filhos') && !cursor && !searchTerm?.trim();
}

export function trustedZendeskCursor(
  cursor: string | null | undefined,
  subdomain: string,
  expectedPath: string,
  expectedSearchQuery?: string,
): string | null {
  if (!cursor) return null;
  const expectedOrigin = `https://${subdomain}.zendesk.com`;
  let parsed: URL;
  try { parsed = new URL(cursor, expectedOrigin); } catch { throw new Error('Cursor de paginação inválido.'); }
  if (parsed.origin !== expectedOrigin || parsed.pathname !== expectedPath ||
      parsed.username || parsed.password || parsed.hash ||
      (parsed.searchParams.has('page[size]') && Number(parsed.searchParams.get('page[size]')) > 25) ||
      (parsed.searchParams.has('per_page') && Number(parsed.searchParams.get('per_page')) > 25) ||
      (expectedSearchQuery !== undefined && parsed.searchParams.get('query') !== expectedSearchQuery)) {
    throw new Error('Cursor de paginação fora da fila autorizada.');
  }
  return parsed.toString();
}

export function canReadQueueTicket(
  role: string,
  userId: string,
  queueType: QueueType,
  assignedTo: string | null,
): boolean {
  if (role === 'admin' || role === 'gestor_qualidade') return true;
  if (queueType === 'negativas' || queueType === 'filhos') return role === 'qualidade' && assignedTo === userId;
  return role === 'qualidade' || role === 'gestor_suporte';
}

export function canReadMatchedTicketTeam(role: string, matchedTeamId: string | null, managerTeamIds: string[]): boolean {
  if (role !== 'gestor_suporte') return ['admin', 'gestor_qualidade', 'qualidade'].includes(role);
  return Boolean(matchedTeamId && managerTeamIds.includes(matchedTeamId));
}
