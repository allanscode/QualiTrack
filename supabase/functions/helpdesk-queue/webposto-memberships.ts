export interface ZendeskMembership {
  user_id: number;
  group_id: number;
  default?: boolean;
}

export interface ZendeskMembershipGroup {
  id: number;
  name: string;
}

export interface ZendeskMembershipUser {
  id: number;
  email?: string | null;
  user_fields?: Record<string, unknown> | null;
}

export interface LocalMembershipUser {
  id: string;
  name: string;
  email: string;
  role: string;
  primary_team_id: string | null;
  external_id: string | null;
  source_system: string | null;
}

export type DivisionSuggestion = 'Cliente Final' | 'Revenda' | 'Escala' | 'Mais Pagamentos'
  | 'PJ Bruno' | 'PJ Duarte' | 'PJ SumWise' | 'PJ Trindade' | null;

export interface DivisionPreviewRow {
  user_id: string;
  name: string;
  current_team: string;
  zendesk_groups: string[];
  zendesk_primary_groups: string[];
  zendesk_team_field: string | null;
  suggested_team: DivisionSuggestion;
  status: 'sugerido' | 'revisar' | 'pj_preservado' | 'atribuido';
  reason: string;
}

const normalize = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function previewWebpostoDivisions(input: {
  localUsers: LocalMembershipUser[];
  teams: { id: string; name: string }[];
  memberships: ZendeskMembership[];
  zendeskUsers: ZendeskMembershipUser[];
  zendeskGroups: ZendeskMembershipGroup[];
  webPostoTeamId: string;
}): DivisionPreviewRow[] {
  const zendeskIdByEmail = new Map(input.zendeskUsers
    .filter(user => typeof user.email === 'string' && user.email.trim())
    .map(user => [user.email!.toLowerCase().trim(), user.id]));
  const zendeskUserById = new Map(input.zendeskUsers.map(user => [user.id, user]));
  const membershipGroups = new Map<number, Set<number>>();
  for (const membership of input.memberships) {
    if (!Number.isSafeInteger(membership.user_id) || !Number.isSafeInteger(membership.group_id)) continue;
    const ids = membershipGroups.get(membership.user_id) || new Set<number>();
    ids.add(membership.group_id);
    membershipGroups.set(membership.user_id, ids);
  }
  const groupNames = new Map(input.zendeskGroups.map(group => [group.id, group.name]));
  const teamNames = new Map(input.teams.map(team => [team.id, team.name]));

  return input.localUsers.filter(user => user.role === 'suporte').map(user => {
    const byId = user.source_system === 'zendesk' && /^\d+$/.test(user.external_id || '')
      ? Number(user.external_id) : null;
    const byEmail = zendeskIdByEmail.get(user.email.toLowerCase().trim()) || null;
    const identityConflict = byId !== null && byEmail !== null && byId !== byEmail;
    const zendeskId = identityConflict ? null : byId ?? byEmail;
    const fields = zendeskId === null ? null : zendeskUserById.get(zendeskId)?.user_fields;
    const rawTeamField = fields?.vinculado_a_equipe ?? fields?.equipe;
    const zendeskTeamField = typeof rawTeamField === 'string' && rawTeamField.trim() ? rawTeamField.trim() : null;
    const names = zendeskId === null ? [] : [...(membershipGroups.get(zendeskId) || [])]
      .map(groupId => groupNames.get(groupId))
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b));
    const defaultGroupNames = zendeskId === null ? [] : input.memberships
      .filter(membership => membership.user_id === zendeskId && membership.default === true)
      .map(membership => groupNames.get(membership.group_id))
      .filter((name): name is string => Boolean(name));
    const normalized = defaultGroupNames.map(normalize);
    const isPjTeam = normalize(teamNames.get(user.primary_team_id || '') || '').startsWith('pj ');
    const fieldPjName = /^grupo_(bruno|duarte|sumwise|trindade)(?:_|$)/.exec(normalize(zendeskTeamField || ''))?.[1];
    const pjTeamName = fieldPjName ? ({ bruno: 'PJ Bruno', duarte: 'PJ Duarte',
      sumwise: 'PJ SumWise', trindade: 'PJ Trindade' } as const)[fieldPjName as 'bruno' | 'duarte' | 'sumwise' | 'trindade'] : null;
    const hasFieldGroup = normalized.some(name => /(^|\b)(campo|pj)(\b|$)/.test(name)
      || /^grupo (bruno|duarte|sumwise|trindade)\b/.test(name));
    const isWebPostoRoot = user.primary_team_id === input.webPostoTeamId;
    const final = normalized.some(name => name.includes('cliente final') || name.includes('cliente sul'));
    const revenda = normalized.some(name => name.includes('revenda'));
    const escala = normalized.some(name => name.includes('escala'));
    const maisPagamentos = normalized.some(name => name.includes('mais pagamentos'));
    const explicitRevendaManager = user.email.toLowerCase().trim() === 'victor.aguiar@webposto.com.br';

    let suggested_team: DivisionSuggestion = null;
    let status: DivisionPreviewRow['status'] = 'revisar';
    let reason = 'Sem vínculo exclusivo com Cliente Final ou Revenda no Zendesk.';
    if (identityConflict) {
      reason = 'ID externo e e-mail apontam para usuários Zendesk diferentes.';
    } else if (zendeskId === null) {
      reason = 'Usuário não encontrado entre os agentes dos grupos consultados.';
    } else if (isPjTeam && pjTeamName === teamNames.get(user.primary_team_id || '')) {
      status = 'pj_preservado';
      reason = 'Equipe PJ confirmada pelo campo de equipe no Zendesk. O grupo principal indica a frente de atendimento.';
    } else if (isPjTeam) {
      reason = 'Equipe PJ atual não confirmada pelo campo de equipe do Zendesk; revisar a exceção antes de alterar.';
    } else if (pjTeamName) {
      suggested_team = pjTeamName;
      status = 'sugerido';
      reason = `Campo “Vinculado à equipe” no Zendesk indica ${pjTeamName}.`;
    } else if (hasFieldGroup) {
      reason = 'Vínculo com grupo de campo; confira a equipe PJ antes da atribuição.';
    } else if (defaultGroupNames.length !== 1) {
      reason = 'Grupo principal ausente ou ambíguo no Zendesk; grupos secundários não definem a equipe.';
    } else if (normalized[0] === normalize(teamNames.get(user.primary_team_id || '') || '')) {
      status = 'atribuido';
      reason = 'Equipe atual corresponde ao grupo principal no Zendesk.';
    } else if (explicitRevendaManager) {
      suggested_team = 'Revenda';
      status = 'sugerido';
      reason = 'Victor foi definido como gestor da Revenda; mantém o atendimento aos dois grupos.';
    } else if (final && revenda) {
      reason = 'Grupo principal atende frentes diferentes; revisar a equipe responsável.';
    } else if (escala) {
      suggested_team = 'Escala';
      status = 'sugerido';
      reason = 'Grupo principal de Escala no Zendesk.';
    } else if (final || revenda) {
      suggested_team = final ? 'Cliente Final' : 'Revenda';
      status = 'sugerido';
      reason = 'Grupo principal no Zendesk indica esta frente de atendimento.';
    } else if (maisPagamentos) {
      suggested_team = 'Mais Pagamentos';
      status = 'sugerido';
      reason = 'Grupo principal de Mais Pagamentos no Zendesk.';
    }

    if (suggested_team && !isWebPostoRoot) {
      status = suggested_team === teamNames.get(user.primary_team_id || '') ? 'atribuido' : 'revisar';
      reason = status === 'atribuido' ? 'Equipe atual corresponde ao grupo principal no Zendesk.'
        : `Grupo principal sugere ${suggested_team}; confira eventual exceção antes de alterar a equipe atual.`;
    }

    return {
      user_id: user.id,
      name: user.name,
      current_team: teamNames.get(user.primary_team_id || '') || 'Sem equipe',
      zendesk_groups: names,
      zendesk_primary_groups: defaultGroupNames,
      zendesk_team_field: zendeskTeamField,
      suggested_team,
      status,
      reason,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
