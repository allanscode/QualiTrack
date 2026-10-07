import { describe, expect, it } from 'vitest';
import { csatStatusToSatisfactionResult, satisfactionResponseTimestamp } from './satisfaction';

describe('lookup_ticket CSAT conversion', () => {
  it('converts Zendesk scores in the Edge Function', () => {
    expect(csatStatusToSatisfactionResult('good')).toBe('Positiva');
    expect(csatStatusToSatisfactionResult('bad_with_comment')).toBe('Negativa');
    expect(csatStatusToSatisfactionResult('unoffered')).toBe('Sem pesquisa');
  });
});

describe('satisfactionResponseTimestamp', () => {
  it('uses created_at as the moment the customer submitted the rating', () => {
    expect(satisfactionResponseTimestamp({ satisfaction_rating: {
      created_at: '2026-09-23T17:00:00Z', updated_at: '2026-09-23T20:14:00Z',
    } })).toBe('2026-09-23T17:00:00Z');
  });

  it('supports the array shape returned by some legacy accounts', () => {
    expect(satisfactionResponseTimestamp({ satisfaction_rating: [{ created_at: '2026-09-23T20:14:00Z' }] }))
      .toBe('2026-09-23T20:14:00Z');
  });
});
