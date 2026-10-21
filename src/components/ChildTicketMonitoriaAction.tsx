import { Check, FileText } from 'lucide-react';
import type { AuditingQueueTicket } from '../types';
import Button from './ui/Button';

interface Props {
  ticket: AuditingQueueTicket;
  onOpen?: (id: string) => void;
  onStart?: () => void;
  onStartManual?: () => void;
  loading?: boolean;
}

export default function ChildTicketMonitoriaAction({ ticket, onOpen, onStart, onStartManual, loading }: Props) {
  if (ticket.already_audited || ticket.monitoria_id) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-xs text-brand-muted">Este ticket já tem uma monitoria salva.</span>
        {ticket.monitoria_id && onOpen ? (
          <Button size="sm" variant="outline" onClick={() => onOpen(ticket.monitoria_id!)}>
            <FileText className="h-4 w-4" /> Ver monitoria existente
          </Button>
        ) : <span className="text-xs text-brand-muted">Consulte o ticket na lista de Monitorias.</span>}
        {onStart && ticket.child_evaluation && (
          <>
            <Button size="sm" variant="primary" disabled={loading} onClick={onStart}>
              <Check className="h-4 w-4" /> Abrir nova ficha com IA
            </Button>
            <span className="max-w-xs text-right text-xs text-brand-muted">A ficha anterior será preservada. Revise a nova antes de salvar.</span>
          </>
        )}
        {onStartManual && (
          <Button size="sm" variant="outline" disabled={loading} onClick={onStartManual}>
            <FileText className="h-4 w-4" /> Avaliar Filho Manualmente
          </Button>
        )}
      </div>
    );
  }
  return onStart ? (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button variant="primary" size="sm" disabled={loading} onClick={onStart}>
        <Check className="h-4 w-4" /> Abrir ficha de monitoria
      </Button>
      {onStartManual && <Button variant="outline" size="sm" disabled={loading} onClick={onStartManual}>
        <FileText className="h-4 w-4" /> Avaliar Filho Manualmente
      </Button>}
    </div>
  ) : onStartManual ? (
    <Button variant="outline" size="sm" disabled={loading} onClick={onStartManual}>
      <FileText className="h-4 w-4" /> Avaliar Filho Manualmente
    </Button>
  ) : null;
}
