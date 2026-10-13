import { RefreshCw } from 'lucide-react';
import type { AuditingQueueTicket } from '../types';
import Button from './ui/Button';

interface Props {
  ticket: AuditingQueueTicket;
  loading: boolean;
  onReevaluate?: () => void;
}

export default function ChildTicketReevaluateAction({ ticket, loading, onReevaluate }: Props) {
  if (!onReevaluate || !ticket.child_evaluation || ticket.already_audited || ticket.monitoria_id) return null;
  return (
    <Button size="sm" variant="outline" disabled={loading} onClick={onReevaluate}
      title="Gerar um novo parecer da IA para este chamado filho">
      <RefreshCw className="h-3.5 w-3.5" /> Reavaliar com IA
    </Button>
  );
}
