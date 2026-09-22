import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, UserCheck, UserCog, Wifi, X } from 'lucide-react';
import { User } from '../types';
import { QueueAssignment } from '../lib/queueDistribution';
import Button from './ui/Button';

interface QueueMonitorAssignmentModalProps {
  ticketId: string;
  assignment: QueueAssignment;
  monitors: User[];
  onClose: () => void;
  onTransfer: (monitorId: string, confirmInProgress: boolean) => Promise<void>;
}

export default function QueueMonitorAssignmentModal({
  ticketId,
  assignment,
  monitors,
  onClose,
  onTransfer,
}: QueueMonitorAssignmentModalProps) {
  const availableMonitors = useMemo(
    () => monitors.filter(monitor => monitor.id !== assignment.assigned_to),
    [assignment.assigned_to, monitors]
  );
  const [selectedMonitorId, setSelectedMonitorId] = useState(availableMonitors[0]?.id || '');
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting]);

  const selectedMonitor = availableMonitors.find(monitor => monitor.id === selectedMonitorId);
  const isInProgress = assignment.status === 'in_progress';

  const handleSubmit = async () => {
    if (!selectedMonitorId) return;
    if (isInProgress && !confirmingTransfer) {
      setConfirmingTransfer(true);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onTransfer(selectedMonitorId, isInProgress);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível transferir o ticket.');
      setSubmitting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4 py-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="presentation"
        onMouseDown={event => {
          if (event.target === event.currentTarget && !submitting) onClose();
        }}
      >
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="assignment-modal-title"
          aria-describedby="assignment-modal-description"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-lg rounded-3xl border border-surface-border bg-surface-card p-6 shadow-premium"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-accent/12 text-brand-accent">
                <UserCog className="h-5 w-5" />
              </span>
              <div>
                <h2 id="assignment-modal-title" className="text-lg font-black text-brand-primary">
                  Alterar monitor
                </h2>
                <p id="assignment-modal-description" className="mt-1 text-sm text-brand-muted">
                  Defina quem ficará responsável pelo ticket <span className="font-mono font-bold text-brand-primary">#{ticketId}</span>.
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl p-2 text-brand-muted transition-colors hover:bg-surface-subtle hover:text-brand-primary disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {availableMonitors.length > 0 ? (
              <div>
                <label htmlFor="assignment-monitor" className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
                  Novo responsável
                </label>
                <div className="relative mt-2">
                  <UserCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                  <select
                    id="assignment-monitor"
                    value={selectedMonitorId}
                    onChange={event => {
                      setSelectedMonitorId(event.target.value);
                      setConfirmingTransfer(false);
                      setError('');
                    }}
                    disabled={submitting}
                    className="w-full appearance-none rounded-2xl border border-surface-border bg-surface-subtle py-3 pl-10 pr-10 text-sm font-bold text-brand-primary outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 disabled:opacity-60"
                  >
                    {availableMonitors.map(monitor => (
                      <option key={monitor.id} value={monitor.id}>{monitor.name}</option>
                    ))}
                  </select>
                  <Wifi className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-functional-success" />
                </div>
                <p className="mt-2 text-xs text-brand-muted">Somente monitores habilitados e online aparecem nesta lista.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-surface-border bg-surface-subtle/60 p-4 text-sm text-brand-muted">
                Não há outro monitor elegível e online para receber este ticket.
              </div>
            )}

            {confirmingTransfer && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-functional-warning/30 bg-functional-warning/10 p-4"
                role="alert"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-functional-warning" />
                  <div>
                    <p className="text-sm font-black text-brand-primary">Avaliação em andamento</p>
                    <p className="mt-1 text-xs leading-relaxed text-brand-muted">
                      O trabalho atual será interrompido e {selectedMonitor?.name || 'o novo monitor'} passará a ser o único responsável. Deseja confirmar a transferência?
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {error && (
              <p className="rounded-xl border border-functional-error/25 bg-functional-error/10 px-3 py-2 text-xs font-bold text-functional-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant={confirmingTransfer ? 'danger' : 'primary'}
              onClick={handleSubmit}
              disabled={!selectedMonitorId || submitting}
              className="justify-center"
            >
              {submitting ? 'Transferindo...' : confirmingTransfer ? 'Confirmar transferência' : 'Transferir ticket'}
            </Button>
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
