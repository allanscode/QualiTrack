import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import QueueMonitorFilter from '../../../src/components/QueueMonitorFilter';
import QueueMonitorPresencePanel from '../../../src/components/QueueMonitorPresencePanel';
import { matchesAssignedMonitor } from '../../../src/lib/queueMonitorFilter';
import { QueueAssignment } from '../../../src/lib/queueDistribution';
import { User } from '../../../src/types';

const monitors: User[] = [
  { id: 'a', name: 'Gabriel Dias Di Napoli', email: 'gabriel@example.invalid', role: 'qualidade', active: true, created_at: '' },
  { id: 'b', name: 'Vinícius Gouvêa', email: 'vinicius@example.invalid', role: 'qualidade', active: true, created_at: '' },
  { id: 'c', name: 'Monitor com Nome Particularmente Longo para Verificar a Quebra Responsiva', email: 'outro@example.invalid', role: 'qualidade', active: true, created_at: '' },
];
const tickets = [
  { id: '101', subject: 'Atendimento Gabriel', draft: true },
  { id: '102', subject: 'Atendimento Vinícius', draft: false },
];
const assignments: Record<string, QueueAssignment> = {
  '101': { ticket_id: '101', queue_type: 'negativas', assigned_to: 'a', status: 'pending', assignment_source: 'automatic', started_at: null, started_by: null },
  '102': { ticket_id: '102', queue_type: 'negativas', assigned_to: 'b', status: 'pending', assignment_source: 'manual', started_at: null, started_by: null },
};

function Harness() {
  const role = new URLSearchParams(window.location.search).get('role') || 'admin';
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [draftOnly, setDraftOnly] = useState(false);
  const visible = tickets.filter(ticket => matchesAssignedMonitor('negativas', role, selected, ticket.id, assignments, true)
    && ticket.subject.toLowerCase().includes(search.toLowerCase()) && (!draftOnly || ticket.draft));

  return (
    <main className="min-h-screen bg-surface-bg p-4 sm:p-8 text-brand-primary dark">
      <div className="mx-auto max-w-5xl space-y-4">
        <QueueMonitorPresencePanel monitors={monitors} eligibility={{ a: true, b: true, c: false }} onlineUserIds={new Set(['a'])} onEligibilityChange={() => {}} />
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="Buscar" value={search} onChange={event => setSearch(event.target.value)} className="rounded-xl border border-surface-border bg-surface-card px-3 py-2" />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draftOnly} onChange={event => setDraftOnly(event.target.checked)} />Com rascunho</label>
          {(role === 'admin' || role === 'gestor_qualidade') && <QueueMonitorFilter monitors={monitors} value={selected} onChange={setSelected} found={visible.length} assignmentsReady />}
        </div>
        {visible.length ? visible.map(ticket => <div key={ticket.id} data-testid="ticket" className="rounded-xl border border-surface-border bg-surface-card p-4">#{ticket.id} {ticket.subject}</div>) : <p>Nenhum ticket deste monitor nesta página da fila.</p>}
      </div>
    </main>
  );
}

document.documentElement.classList.add('dark');
createRoot(document.getElementById('root')!).render(<Harness />);
