import { describe, expect, it } from 'vitest';
import { previewWebpostoDivisions, type LocalMembershipUser } from './webposto-memberships';

const local = (id: string, teamId: string, externalId: string): LocalMembershipUser => ({
  id, name: id, email: `${id}@example.invalid`, role: 'suporte', primary_team_id: teamId,
  external_id: externalId, source_system: 'zendesk',
});

describe('Zendesk membership preview respects PJ/CLT ownership', () => {
  const teams = [{ id: 'web', name: 'WebPosto' }, { id: 'pj', name: 'PJ Bruno' }, { id: 'final', name: 'Cliente Final' }];
  const zendeskGroups = [
    { id: 10, name: 'Cliente Final' }, { id: 11, name: 'Revenda' },
    { id: 12, name: 'Equipe de Campo' }, { id: 13, name: 'Escala - TEF' },
    { id: 14, name: 'Cliente Sul - Retaguarda' }, { id: 15, name: 'Mais Pagamentos - Portal' },
  ];

  it('suggests only exclusive CLT groups and preserves field/PJ agents', () => {
    const localUsers = [local('final', 'web', '1'), local('reseller', 'web', '2'),
      local('both', 'web', '3'), local('field', 'web', '4'), local('pj-agent', 'pj', '5'),
      local('already-assigned', 'final', '6'), local('pj-field', 'web', '7'),
      local('tef', 'web', '8'), local('sul', 'web', '9'), local('payments', 'web', '10')];
    const memberships = [
      { user_id: 1, group_id: 10 }, { user_id: 2, group_id: 11 },
      { user_id: 3, group_id: 10 }, { user_id: 3, group_id: 11 },
      { user_id: 4, group_id: 10 }, { user_id: 4, group_id: 12 },
      { user_id: 5, group_id: 11 }, { user_id: 7, group_id: 10 },
      { user_id: 6, group_id: 10 },
      { user_id: 8, group_id: 13 }, { user_id: 9, group_id: 14 }, { user_id: 10, group_id: 15 },
    ];
    const rows = previewWebpostoDivisions({ localUsers, teams, memberships,
      zendeskUsers: [{ id: 7, user_fields: { vinculado_a_equipe: 'grupo_bruno' } }],
      zendeskGroups, webPostoTeamId: 'web' });
    const byId = Object.fromEntries(rows.map(row => [row.user_id, row]));
    expect(byId.final.suggested_team).toBe('Cliente Final');
    expect(byId.reseller.suggested_team).toBe('Revenda');
    expect(byId.both.suggested_team).toBe('Escala');
    expect(byId.field.status).toBe('revisar');
    expect(byId['pj-agent'].status).toBe('pj_preservado');
    expect(byId['already-assigned'].status).toBe('atribuido');
    expect(byId['pj-field'].suggested_team).toBe('PJ Bruno');
    expect(byId.tef.suggested_team).toBe('Escala');
    expect(byId.sul.suggested_team).toBe('Cliente Final');
    expect(byId.payments.suggested_team).toBe('Mais Pagamentos');
  });

  it('does not suggest an identity when Zendesk ID and email disagree', () => {
    const rows = previewWebpostoDivisions({
      localUsers: [local('agent', 'web', '1')], teams,
      memberships: [{ user_id: 1, group_id: 10 }, { user_id: 2, group_id: 11 }],
      zendeskUsers: [{ id: 2, email: 'agent@example.invalid' }], zendeskGroups,
      webPostoTeamId: 'web',
    });
    expect(rows[0].status).toBe('revisar');
    expect(rows[0].suggested_team).toBeNull();
  });
});
