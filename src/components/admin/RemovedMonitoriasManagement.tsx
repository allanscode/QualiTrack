import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RefreshCw, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '../../types';
import { fetchRemovedMonitorias, restoreRemovedMonitoria, type RemovedMonitoria } from '../../lib/removedMonitorias';
import Button from '../ui/Button';
import Card from '../ui/Card';

interface Props {
  currentUser: User;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

export default function RemovedMonitoriasManagement({ currentUser }: Props) {
  const [ticketInput, setTicketInput] = useState('');
  const [ticketFilter, setTicketFilter] = useState('');
  const [rows, setRows] = useState<RemovedMonitoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchRemovedMonitorias(ticketFilter));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as monitorias removidas.');
    } finally {
      setLoading(false);
    }
  }, [ticketFilter]);

  useEffect(() => { void load(); }, [load]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ticketId = ticketInput.trim();
    if (ticketId === ticketFilter) void load();
    else setTicketFilter(ticketId);
  }

  async function handleRestore() {
    if (!selectedId || restoring) return;
    setRestoring(true);
    try {
      await restoreRemovedMonitoria(selectedId, reason, currentUser);
      toast.success('Monitoria restaurada. O motivo foi registrado no histórico.');
      setSelectedId(null);
      setReason('');
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível restaurar a monitoria.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-brand-primary">Monitorias removidas</h2>
        <p className="mt-1 text-sm text-brand-muted">Recupere uma monitoria removida e registre o motivo da restauração.</p>
      </div>

      <Card>
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-semibold text-brand-primary">
            Número do ticket
            <input
              value={ticketInput}
              onChange={event => setTicketInput(event.target.value)}
              placeholder="Ex.: 182786"
              className="w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-sm text-brand-primary outline-none focus:border-brand-highlight"
            />
          </label>
          <Button type="submit" icon={<Search className="h-4 w-4" />}>Buscar</Button>
          <Button type="button" variant="outline" onClick={() => void load()} loading={loading} icon={<RefreshCw className="h-4 w-4" />}>Atualizar</Button>
        </form>
        {!ticketFilter && <p className="mt-3 text-xs text-brand-muted">Exibindo as 50 remoções mais recentes. Busque pelo número para encontrar uma monitoria mais antiga.</p>}
      </Card>

      {error && <Card><p role="alert" className="text-sm text-error">{error}</p></Card>}
      {loading && <p role="status" className="text-sm text-brand-muted">Carregando monitorias removidas...</p>}
      {!loading && !error && rows.length === 0 && (
        <Card><p className="text-sm text-brand-muted">Nenhuma monitoria removida encontrada{ticketFilter ? ` para o ticket ${ticketFilter}` : ''}.</p></Card>
      )}

      {!loading && rows.map(row => (
        <Card key={row.id}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-base font-bold text-brand-primary">Ticket #{row.ticket_id}</p>
              <p className="text-sm text-brand-muted">{row.evaluated_name || 'Atendente não informado'} · {row.status.replaceAll('_', ' ')}</p>
              <p className="text-xs text-brand-muted">Nota {row.score} · Atualizada em {formatDate(row.updated_at)}</p>
              <p className="text-xs text-brand-muted">Monitoria {row.id}</p>
            </div>
            <Button type="button" variant="outline" icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => { setSelectedId(row.id); setReason(''); }}>
              Restaurar
            </Button>
          </div>
          {selectedId === row.id && (
            <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
              <p className="text-sm font-semibold text-brand-primary">Confirmar restauração da monitoria do ticket #{row.ticket_id}</p>
              <label className="block text-sm font-semibold text-brand-primary">
                Motivo da restauração
                <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} rows={3}
                  className="mt-1.5 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-brand-primary outline-none focus:border-brand-highlight"
                  placeholder="Descreva por que esta monitoria deve ser recuperada" />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void handleRestore()} loading={restoring} disabled={!reason.trim()}>Confirmar restauração</Button>
                <Button type="button" variant="ghost" disabled={restoring} onClick={() => { setSelectedId(null); setReason(''); }}>Cancelar</Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
