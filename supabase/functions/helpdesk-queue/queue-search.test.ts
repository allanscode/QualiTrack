import { describe, expect, it } from 'vitest';
import { literalSearchTerm, queueSearchQuery, ticketCanReceiveEvaluation, ticketMatchesQueue } from './queue-search';
import { shouldMergeRecentQueueSnapshot, trustedZendeskCursor } from './access';

describe('queue search boundaries', () => {
  it('turns query operators, quotes and control characters into literal words', () => {
    expect(literalSearchTerm('falha satisfação')).toBe('"falha" "satisfação"');
    expect(literalSearchTerm('" type:user OR satisfaction_score:good -tags:validado\n')).toBe('"type" "user" "OR" "satisfaction_score" "good" "tags" "validado"');
    expect(() => literalSearchTerm('"\\:*')).toThrow();
  });
  it('rejects results outside the queue even if the provider returns them', () => {
    expect(ticketMatchesQueue({ satisfaction_rating: { score: 'good' } }, 'negativas', '')).toBe(false);
    expect(ticketMatchesQueue({ satisfaction_rating: { score: 'bad' }, tags: ['validado'] }, 'negativas', 'validado')).toBe(false);
    expect(ticketMatchesQueue({ satisfaction_rating: { score: 'bad' } }, 'proativas', '')).toBe(false);
    expect(ticketMatchesQueue({ tags: ['existe_ticket_filho'] }, 'filhos', '')).toBe(true);
    expect(ticketMatchesQueue({ tags: ['existe_ticket_filho', 'qwp_filho_avaliado'] }, 'filhos', '')).toBe(false);
    expect(ticketCanReceiveEvaluation({ status: 'solved', tags: ['qwp_filho_avaliado'] }, 'filhos_invalidos')).toBe(false);
    expect(ticketMatchesQueue({ tags: [] }, 'filhos', '')).toBe(false);
    expect(ticketMatchesQueue({ status: 'closed', satisfaction_rating: { score: 'bad' } }, 'negativas', '')).toBe(false);
    expect(ticketMatchesQueue({ status: 'closed', satisfaction_rating: { score: 'unoffered' } }, 'proativas', '')).toBe(true);
    expect(ticketCanReceiveEvaluation({ status: 'closed' })).toBe(false);
    expect(ticketCanReceiveEvaluation({ status: 'closed' }, 'proativas')).toBe(true);
    expect(ticketCanReceiveEvaluation({ status: 'solved' })).toBe(true);
  });
  it('does not mix unrelated cached assignments into search results', () => {
    expect(shouldMergeRecentQueueSnapshot('negativas', null, '123')).toBe(false);
    expect(shouldMergeRecentQueueSnapshot('filhos', null, 'falha')).toBe(false);
    expect(shouldMergeRecentQueueSnapshot('negativas', null)).toBe(true);
  });
  it('uses supported Zendesk search terms and excludes closed tickets', () => {
    expect(queueSearchQuery('negativas', 'validado')).toBe('type:ticket status<closed satisfaction:bad -tags:validado');
    expect(queueSearchQuery('positivas', '')).toBe('type:ticket status<closed satisfaction:good');
    expect(queueSearchQuery('proativas', '')).toBe('type:ticket status:closed satisfaction:offered');
  });
  it('binds offset pagination to the original search and bounded page size', () => {
    const url = 'https://example.zendesk.com/api/v2/search.json?query=type%3Aticket&per_page=25&page=2';
    expect(trustedZendeskCursor(url, 'example', '/api/v2/search.json', 'type:ticket')).toBe(url);
    expect(() => trustedZendeskCursor(url.replace('25', '100'), 'example', '/api/v2/search.json', 'type:ticket')).toThrow();
    expect(() => trustedZendeskCursor(url, 'example', '/api/v2/search.json', 'type:user')).toThrow();
  });
});
