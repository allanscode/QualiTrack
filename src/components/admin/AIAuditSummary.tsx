import { useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle2, ClipboardList, RefreshCw, ScanSearch } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AIAuditSummaryData {
  evaluated_tickets: number;
  generated_monitorias: number;
  concluded_monitorias: number;
  awaiting_review: number;
}

const metrics = [
  { key: 'evaluated_tickets', label: 'Tickets avaliados', detail: 'Tickets únicos com avaliação concluída pela IA', icon: Bot },
  { key: 'generated_monitorias', label: 'Monitorias geradas', detail: 'Fichas salvas após uma avaliação da IA', icon: ClipboardList },
  { key: 'concluded_monitorias', label: 'Monitorias concluídas', detail: 'Fichas geradas que já encerraram o fluxo', icon: CheckCircle2 },
  { key: 'awaiting_review', label: 'Aguardando revisão', detail: 'Pareceres salvos, ainda sem monitoria', icon: ScanSearch },
] as const;

export default function AIAuditSummary() {
  const [summary, setSummary] = useState<AIAuditSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!supabase) throw new Error('Indicadores indisponíveis no modo local.');
      const { data, error: queryError } = await supabase.rpc('get_ai_audit_summary');
      if (queryError) throw queryError;
      const row = (data as AIAuditSummaryData[] | null)?.[0];
      if (!row) throw new Error('A consulta não retornou os indicadores.');
      setSummary(row);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os indicadores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return (
    <section aria-labelledby="ai-audit-summary-title" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="ai-audit-summary-title" className="text-base font-bold text-brand-primary">Resultado das avaliações da IA</h3>
          <p className="text-xs text-brand-muted">Histórico completo. Cada ticket é contado uma vez; o andamento vem das fichas e dos pareceres salvos.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-muted hover:bg-surface-subtle hover:text-brand-primary disabled:opacity-50"
          aria-label="Atualizar indicadores da IA">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>
      {error && <p role="alert" className="rounded-xl border border-functional-error/30 bg-functional-error/10 px-4 py-2 text-xs text-functional-error">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={loading}>
        {metrics.map(({ key, label, detail, icon: Icon }) => (
          <div key={key} className="rounded-2xl border border-surface-border bg-surface-card p-4">
            <div className="flex items-center gap-2 text-brand-muted">
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-semibold">{label}</span>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-brand-primary">
              {summary ? summary[key].toLocaleString('pt-BR') : '—'}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-brand-muted">{detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
