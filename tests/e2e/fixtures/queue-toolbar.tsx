import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import AuditingQueueView from '../../../src/components/AuditingQueueView';
import { PresenceProvider } from '../../../src/providers/PresenceProvider';
import { User, QueueSubTab, EvaluationForm, Team, Monitoria } from '../../../src/types';

const mockCurrentUser: User = {
  id: 'usr-admin-1',
  name: 'Administrador de Teste',
  email: 'admin@test.invalid',
  role: 'admin',
  active: true,
  created_at: new Date().toISOString(),
};

const mockMonitors: User[] = [
  { id: 'mon-1', name: 'Gabriel Dias', email: 'gabriel@test.invalid', role: 'qualidade', active: true, created_at: new Date().toISOString() },
  { id: 'mon-2', name: 'Vinícius Gouvêa', email: 'vinicius@test.invalid', role: 'qualidade', active: true, created_at: new Date().toISOString() },
];

const mockTeams: Team[] = [
  { id: 'team-1', name: 'N1 - Suporte', active: true },
];

const mockForms: EvaluationForm[] = [
  {
    id: 'form-1',
    title: 'Ficha Padrão Suporte',
    description: 'Avaliação padrão',
    type: 'padrao',
    active: true,
    sections: [],
  },
];

const mockMonitorias: Monitoria[] = [];

function QueueToolbarHarness() {
  const params = new URLSearchParams(window.location.search);
  const initialSubTab = (params.get('subTab') as QueueSubTab) || 'negativas';
  const role = params.get('role') || 'admin';
  const user = { ...mockCurrentUser, role: role as User['role'] };

  const [activeSubTab, setActiveSubTab] = useState<QueueSubTab>(initialSubTab);

  return (
    <PresenceProvider user={user}>
      <main className="min-h-screen bg-surface-bg text-brand-primary p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <header className="space-y-1">
            <h1 data-testid="queue-page-title" className="text-xl font-bold tracking-tight text-brand-primary">
              {activeSubTab === 'negativas' ? 'CSAT Negativas' : activeSubTab === 'proativas' ? 'Fila Proativa' : 'CSAT Positivas'}
            </h1>
            <p data-testid="queue-page-subtitle" className="text-xs text-brand-muted">
              Triagem inteligente de chamados do Zendesk
            </p>
          </header>

          <AuditingQueueView
            agents={[]}
            teams={mockTeams}
            forms={mockForms}
            monitorias={mockMonitorias}
            currentUserId={user.id}
            currentUserRole={user.role}
            qualityMonitors={mockMonitors}
            onStartAudit={() => {}}
            activeSubTab={activeSubTab}
            onSubTabChange={setActiveSubTab}
          />
        </div>
      </main>
    </PresenceProvider>
  );
}

document.documentElement.classList.add('dark');
createRoot(document.getElementById('root')!).render(<QueueToolbarHarness />);
