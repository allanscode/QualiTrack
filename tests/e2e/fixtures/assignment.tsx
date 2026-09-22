import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import QueueMonitorAssignmentModal from '../../../src/components/QueueMonitorAssignmentModal';
import {
  canManageQueueAssignments,
  QueueAssignment,
} from '../../../src/lib/queueDistribution';
import { User } from '../../../src/types';

const monitors: User[] = [
  { id: 'monitor-1', name: 'Vinícius Gouvêa', email: 'vinicius@example.invalid', role: 'qualidade', active: true, created_at: new Date().toISOString() },
  { id: 'monitor-2', name: 'Gabriel Dias Di Napoli', email: 'gabriel@example.invalid', role: 'qualidade', active: true, created_at: new Date().toISOString() },
];

function Harness() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role') || 'qualidade';
  const initialStatus = params.get('status') === 'in_progress' ? 'in_progress' : 'pending';
  const [assignment, setAssignment] = useState<QueueAssignment>({
    ticket_id: '170882',
    queue_type: 'filhos',
    assigned_to: monitors[0].id,
    status: initialStatus,
    assignment_source: 'automatic',
    started_at: initialStatus === 'in_progress' ? new Date().toISOString() : null,
    started_by: initialStatus === 'in_progress' ? monitors[0].id : null,
  });
  const [open, setOpen] = useState(false);
  const owner = monitors.find(monitor => monitor.id === assignment.assigned_to)?.name || 'Sem responsável';

  return (
    <main className="min-h-screen bg-surface-bg p-8 text-brand-primary">
      <section className="mx-auto max-w-2xl rounded-3xl border border-surface-border bg-surface-card p-6 shadow-premium">
        <h1 className="text-xl font-black">Ticket #170882</h1>
        <p className="mt-2 text-sm text-brand-muted">Responsável: <strong data-testid="current-owner" className="text-brand-primary">{owner}</strong></p>
        <p className="mt-1 text-sm text-brand-muted">Atualização compartilhada: <strong data-testid="observer-owner" className="text-brand-primary">{owner}</strong></p>
        {canManageQueueAssignments(role) && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-5 rounded-xl bg-brand-primary px-4 py-2 text-sm font-bold text-brand-on-primary"
          >
            Alterar monitor
          </button>
        )}
      </section>

      {open && (
        <QueueMonitorAssignmentModal
          ticketId="170882"
          assignment={assignment}
          monitors={monitors}
          onClose={() => setOpen(false)}
          onTransfer={async (monitorId, confirmInProgress) => {
            if (assignment.status === 'in_progress' && !confirmInProgress) throw new Error('Confirmação obrigatória.');
            setAssignment(current => ({
              ...current,
              assigned_to: monitorId,
              assignment_source: 'manual',
              status: 'pending',
              started_at: null,
              started_by: null,
            }));
            setOpen(false);
          }}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
