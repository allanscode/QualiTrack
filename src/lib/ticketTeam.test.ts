import { describe, expect, it } from 'vitest';
import { isVerifiedTicketGroupPair, resolveTicketTeamId } from './ticketTeam';

describe('equipe do ticket Zendesk', () => {
  it('prioriza o grupo do ticket sobre a equipe principal do agente', () => {
    expect(resolveTicketTeamId(
      { ticket_group_team_id: 'tef', team_id: 'cliente-final' },
      { primary_team_id: 'cliente-final', team_ids: ['cliente-final'] },
    )).toBe('tef');
  });

  it('permite a exceção somente para o agente e o grupo do ticket original', () => {
    expect(isVerifiedTicketGroupPair('175595', '175595', 'williams', 'williams', 'tef', 'tef')).toBe(true);
    expect(isVerifiedTicketGroupPair('175595', '175595', 'outro', 'williams', 'tef', 'tef')).toBe(false);
    expect(isVerifiedTicketGroupPair('175595', '175595', 'williams', 'williams', 'cliente-final', 'tef')).toBe(false);
    expect(isVerifiedTicketGroupPair('175596', '175595', 'williams', 'williams', 'tef', 'tef')).toBe(false);
  });
});
