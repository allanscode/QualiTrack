import { describe, expect, it } from 'vitest';
import { isVerifiedTicketGroupPair, resolveTicketTeamId } from './ticketTeam';

describe('equipe do ticket Zendesk', () => {
  it('mantém a equipe gestora mesmo quando o ticket veio de outro grupo', () => {
    expect(resolveTicketTeamId(
      { ticket_group_team_id: 'tef', team_id: 'cliente-final' },
      { primary_team_id: 'cliente-final', team_ids: ['cliente-final'] },
    )).toBe('cliente-final');
  });

  it('permite a exceção somente para o agente e o grupo do ticket original', () => {
    expect(isVerifiedTicketGroupPair('175595', '175595', 'williams', 'williams', 'tef', 'tef')).toBe(true);
    expect(isVerifiedTicketGroupPair('175595', '175595', 'outro', 'williams', 'tef', 'tef')).toBe(false);
    expect(isVerifiedTicketGroupPair('175595', '175595', 'williams', 'williams', 'cliente-final', 'tef')).toBe(false);
    expect(isVerifiedTicketGroupPair('175596', '175595', 'williams', 'williams', 'tef', 'tef')).toBe(false);
  });
});
