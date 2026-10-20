import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { publishChildTicketMacro } from '../lib/helpdeskQueue';
import Button from './ui/Button';
import Card from './ui/Card';

interface Props {
  ticketId: string;
  monitoriaId: string;
  onClose: () => void;
}

type State = { kind: 'sending' } | { kind: 'sent' } | { kind: 'simulated' } | { kind: 'error'; message: string };

export default function ChildTicketPublishModal({ ticketId, monitoriaId, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: 'sending' });
  const started = useRef(false);

  const publish = useCallback(async () => {
    setState({ kind: 'sending' });
    try {
      const result = await publishChildTicketMacro(ticketId, monitoriaId);
      setState({ kind: result.simulated ? 'simulated' : 'sent' });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Falha ao enviar a macro ao Zendesk.' });
    }
  }, [ticketId, monitoriaId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void publish();
  }, [publish]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
      <div role="dialog" aria-modal="true" aria-label="Publicação da monitoria do chamado filho" className="w-full max-w-md">
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          {state.kind === 'sending' ? <Loader2 className="h-6 w-6 animate-spin text-brand-highlight" />
            : state.kind === 'sent' || state.kind === 'simulated' ? <CheckCircle2 className="h-6 w-6 text-functional-success" />
              : <AlertTriangle className="h-6 w-6 text-functional-warning" />}
          <h3 className="font-bold text-brand-primary">Chamado filho #{ticketId}</h3>
        </div>
        <p className="text-sm text-brand-muted">
          {state.kind === 'sending' ? 'Monitoria salva. Enviando o Registro do Auditor ao Zendesk...'
            : state.kind === 'sent' ? 'Monitoria salva e macro de chamado filho válido confirmada no Zendesk.'
              : state.kind === 'simulated' ? 'Simulação concluída. A monitoria foi salva no QWP; nada foi enviado ao Zendesk.'
              : 'A monitoria foi salva no QWP. O envio ao Zendesk ficou pendente.'}
        </p>
        {state.kind === 'error' && <p role="alert" className="text-sm text-functional-error">{state.message}</p>}
        <div className="flex justify-end gap-2">
          {state.kind === 'error' && <Button variant="outline" size="sm" onClick={() => void publish()} icon={<RotateCcw className="h-4 w-4" />}>Tentar novamente</Button>}
          <Button size="sm" variant={state.kind === 'sending' ? 'outline' : 'primary'} disabled={state.kind === 'sending'} onClick={onClose}>
            {state.kind === 'sending' ? 'Enviando...' : 'Fechar'}
          </Button>
        </div>
      </Card>
      </div>
    </div>
  );
}
