import type { QueueType } from './access.ts';

export const CHILD_AUDITED_TAG = 'qwp_filho_avaliado';

// Search is plain text: operators supplied by a browser must never broaden a queue.
export function literalSearchTerm(value: string): string {
  const words = value.match(/[\p{L}\p{N}_]+/gu);
  if (!words?.length) throw new Error('Informe palavras ou o número do ticket.');
  return words.map(word => `"${word}"`).join(' ');
}

export function ticketMatchesQueue(
  ticket: { status?: string; satisfaction_rating?: { score?: string }; tags?: unknown },
  queue: QueueType,
  validatedTag: string,
): boolean {
  if (!ticketCanReceiveEvaluation(ticket, queue)) return false;
  const score = ticket.satisfaction_rating?.score;
  const tags = Array.isArray(ticket.tags) ? ticket.tags : [];
  switch (queue) {
    case 'negativas': return ['bad', 'bad_with_comment'].includes(score || '') && (!validatedTag || !tags.includes(validatedTag));
    case 'positivas': return ['good', 'good_with_comment'].includes(score || '');
    case 'filhos': return tags.includes('existe_ticket_filho');
    case 'filhos_invalidos': return tags.includes('ticket_filho_invalido');
    case 'proativas': return !score || ['unoffered', 'offered'].includes(score);
  }
}

export function ticketCanReceiveEvaluation(
  ticket: { status?: string; tags?: unknown } | null | undefined,
  queue?: QueueType,
): boolean {
  const status = ticket?.status?.toLowerCase();
  if (!ticket || status === 'archived') return false;
  if ((queue === 'filhos' || queue === 'filhos_invalidos') &&
    Array.isArray(ticket.tags) && ticket.tags.includes(CHILD_AUDITED_TAG)) return false;
  if (queue === 'proativas') return true;
  return status !== 'closed';
}

export function queueSearchQuery(queue: QueueType, validatedTag: string): string {
  if (queue === 'proativas') {
    return 'type:ticket status:closed satisfaction:offered';
  }
  const base = 'type:ticket status<closed';
  switch (queue) {
    case 'negativas': return `${base} satisfaction:bad${validatedTag ? ` -tags:${validatedTag}` : ''}`;
    case 'positivas': return `${base} satisfaction:good`;
    case 'filhos': return `${base} tags:existe_ticket_filho`;
    case 'filhos_invalidos': return `${base} tags:ticket_filho_invalido`;
  }
}
