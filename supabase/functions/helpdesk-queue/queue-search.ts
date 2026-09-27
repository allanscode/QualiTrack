import type { QueueType } from './access.ts';

// Search is plain text: operators supplied by a browser must never broaden a queue.
export function literalSearchTerm(value: string): string {
  const words = value.match(/[\p{L}\p{N}_]+/gu);
  if (!words?.length) throw new Error('Informe palavras ou o número do ticket.');
  return words.map(word => `"${word}"`).join(' ');
}

export function ticketMatchesQueue(
  ticket: { satisfaction_rating?: { score?: string }; tags?: unknown },
  queue: QueueType,
  validatedTag: string,
): boolean {
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
