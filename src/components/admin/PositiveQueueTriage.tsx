import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { isMockMode, supabase } from '../../lib/supabase';
import Button from '../ui/Button';

type QueueItem = { ticket_id: string; status: string; last_error: string | null };
type Group = 'low_score' | 'external_evidence' | 'blocked' | 'other';
const groupLabel: Record<Group, string> = {
  low_score: 'Nota baixa para conferência',
  external_evidence: 'Evidência externa pendente',
  blocked: 'Preparação bloqueada',
  other: 'Outras revisões',
};
const groupAction: Record<Group, string> = {
  low_score: 'Confira o erro crítico e o perfil do avaliado. Gestores que atendem tickets seguem o fluxo comum e podem contestar.',
  external_evidence: 'Confira o vínculo, aprovação ou ticket relacionado antes de concluir a ficha.',
  blocked: 'Corrija o cadastro do agente, a equipe, a transcrição ou a conexão indicada no erro.',
  other: 'Confira a ficha e o motivo registrado antes de decidir.',
};
function groupFor(row: QueueItem): Group {
  if (row.status === 'blocked') return 'blocked';
  if (/evidência externa/i.test(row.last_error || '')) return 'external_evidence';
  if (/nota abaixo de 75/i.test(row.last_error || '')) return 'low_score';
  return 'other';
}

export default function PositiveQueueTriage() {
  const [rows, setRows] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (isMockMode || !supabase) {
        setRows([]);
      } else {
        const { data, error: queryError } = await supabase.from('positive_ai_queue')
          .select('ticket_id,status,last_error')
          .in('status', ['review_required', 'blocked'])
          .order('updated_at', { ascending: false }).limit(2000);
        if (queryError) throw queryError;
        setRows((data || []) as QueueItem[]);
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as pendências.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const groups = useMemo(() => {
    const output: Record<Group, QueueItem[]> = {
      low_score: [], external_evidence: [], blocked: [], other: [],
    };
    rows.forEach(row => output[groupFor(row)].push(row));
    return output;
  }, [rows]);

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-5 sm:p-6" aria-labelledby="positive-triage-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-functional-warning" />
          <div>
            <h3 id="positive-triage-title" className="text-base font-bold text-brand-primary">Pendências da fila de positivas</h3>
            <p className="mt-1 text-sm text-brand-muted">Motivos atuais para tratar no QWP. Abra o ticket na fila de auditoria para conferir a ficha.</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" icon={<RefreshCw className="h-4 w-4" />}
          onClick={() => void refresh()} disabled={loading}>Atualizar</Button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-functional-error">{error}</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {(Object.keys(groupLabel) as Group[]).map(group => (
          <div key={group} className="rounded-xl border border-surface-border bg-surface-subtle p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted">{groupLabel[group]}</p>
            <p className="mt-1 text-2xl font-bold text-brand-primary">{loading ? '…' : groups[group].length}</p>
            <p className="mt-1 text-xs text-brand-muted">{groupAction[group]}</p>
            {groups[group].length > 0 && (
              <details className="mt-3 text-xs text-brand-primary">
                <summary className="cursor-pointer font-semibold">Ver tickets</summary>
                <ul className="mt-2 max-h-44 space-y-2 overflow-y-auto text-brand-muted">
                  {groups[group].map(row => (
                    <li key={row.ticket_id} className="break-words border-t border-surface-border pt-2">
                      <strong className="text-brand-primary">#{row.ticket_id}</strong>
                      {row.last_error && <span className="block">{row.last_error}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
      {rows.length >= 2000 && <p className="mt-3 text-xs text-functional-warning">Há mais de 2.000 pendências; os números mostram somente os registros mais recentes.</p>}
    </section>
  );
}
