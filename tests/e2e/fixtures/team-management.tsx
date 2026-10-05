import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import TeamsManagement from '../../../src/components/admin/TeamsManagement';
import type { Team, TeamGroup, User } from '../../../src/types';

const teams: Team[] = [
  { id: 'web', name: 'WebPosto', kind: 'team', active: true, sigla: 'WEB' },
  { id: 'final', name: 'Cliente Final', kind: 'team', active: true, parent_team_id: 'web', approval_manager_id: 'ana' },
  { id: 'revenda', name: 'Revenda', kind: 'team', active: true, parent_team_id: 'web' },
  { id: 'pj', name: 'PJ Bruno', kind: 'team', active: true, requires_pj_review: true },
];
const groups: Team[] = [
  { id: 'group-final', name: 'Cliente Final', kind: 'group', active: true },
  { id: 'group-revenda', name: 'Revenda', kind: 'group', active: true },
  { id: 'group-escala', name: 'Escala', kind: 'group', active: true },
];
const teamGroups: TeamGroup[] = [
  { team_id: 'final', group_id: 'group-final' },
  { team_id: 'final', group_id: 'group-revenda' },
  { team_id: 'revenda', group_id: 'group-final' },
  { team_id: 'revenda', group_id: 'group-revenda' },
  { team_id: 'pj', group_id: 'group-final' },
];
const users: User[] = [
  { id: 'admin', name: 'Administradora', email: 'admin@example.invalid', role: 'admin', active: true },
  { id: 'ana', name: 'Ana Karolina', email: 'ana@example.invalid', role: 'gestor_suporte', active: true, primary_team_id: 'final', team_ids: ['final'] },
  { id: 'ricardo', name: 'Ricardo Fadini', email: 'ricardo@example.invalid', role: 'gestor_suporte', active: true, primary_team_id: 'final', team_ids: ['final'] },
  { id: 'victor', name: 'Victor Ellyan Aguiar', email: 'victor@example.invalid', role: 'gestor_suporte', active: true, primary_team_id: 'revenda', team_ids: ['revenda'] },
  { id: 'agent', name: 'Agente CLT', email: 'agent@example.invalid', role: 'suporte', active: true, primary_team_id: 'web', team_ids: ['web'] },
];

createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-surface-bg p-3 sm:p-8">
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-5 text-2xl font-bold text-brand-primary">Configurações de atendimento</h1>
      <TeamsManagement teams={teams} groups={groups} teamGroups={teamGroups} users={users}
        currentUser={users[0]} loadData={() => {}} />
    </div>
  </main>,
);
