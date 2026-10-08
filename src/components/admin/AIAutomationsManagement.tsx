import { useCallback, useEffect, useState } from 'react';
import { Pause, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '../../types';
import {
  getAIAutomationControls,
  setAIAutomationEnabled,
  type AIAutomationControl,
  type AutomationName,
} from '../../lib/aiAutomationControls';
import Button from '../ui/Button';

const AUTOMATIONS: Array<{ id: AutomationName; title: string; description: string }> = [
  {
    id: 'positivas',
    title: 'Tickets positivos',
    description: 'Avalia automaticamente os tickets da fila Positivas e conclui fichas com nota a partir de 75%.',
  },
  {
    id: 'filhos',
    title: 'Chamados filhos',
    description: 'Conclui chamados conformes e deixa não conformes para revisão do monitor.',
  },
];

function controlStatus(control: AIAutomationControl): string {
  if (!control.enabled) return 'Desligada';
  if (!control.auditor_ready) return 'Auditor indisponível';
  if (control.max_evaluations !== null && control.executions_started >= control.max_evaluations) return 'Limite atingido';
  return 'Ligada';
}

export default function AIAutomationsManagement({ currentUser }: { currentUser: User | null }) {
  const staging = import.meta.env.VITE_SUPABASE_URL === 'https://secfejmccojxsvdntljx.supabase.co';
  const [controls, setControls] = useState<AIAutomationControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<AutomationName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canToggle = currentUser?.role === 'admin' || currentUser?.role === 'gestor_qualidade';

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getAIAutomationControls();
      setControls(rows);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as automações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [refresh]);

  const toggle = async (control: AIAutomationControl) => {
    if (!canToggle || staging) return;
    setBusy(control.automation);
    setError(null);
    try {
      await setAIAutomationEnabled(control.automation, !control.enabled, control.enabled);
      await refresh();
      toast.success(`Automação de ${control.automation === 'positivas' ? 'tickets positivos' : 'chamados filhos'} ${control.enabled ? 'desligada' : 'ligada'}.`);
    } catch (cause) {
      await refresh();
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a automação.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-5 sm:p-6" aria-labelledby="automation-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id="automation-title" className="text-base font-bold text-brand-primary">Avaliações automáticas</h3>
          <p className="mt-1 max-w-2xl text-sm text-brand-muted">
            {staging
              ? 'No staging, a avaliação com IA é apenas manual. As automações permanecem bloqueadas no servidor.'
              : 'Controle cada fila separadamente. Desligar impede novas avaliações; as já iniciadas continuam até terminar.'}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" icon={<RefreshCw className="h-4 w-4" />}
          onClick={() => void refresh()} disabled={loading || busy !== null} aria-label="Atualizar estado das automações">
          Atualizar
        </Button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-functional-error/30 bg-functional-error/10 px-4 py-3 text-sm text-functional-error">{error}</p>}

      <div className="mt-5 divide-y divide-surface-border border-t border-surface-border">
        {AUTOMATIONS.map(automation => {
          const control = controls.find(item => item.automation === automation.id);
          const status = staging ? 'Somente manual' : control ? controlStatus(control) : 'Indisponível';
          const capped = Boolean(control && control.max_evaluations !== null
            && control.executions_started >= control.max_evaluations);
          return (
            <div key={automation.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-brand-primary">{automation.title}</h4>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${status === 'Ligada'
                    ? 'bg-functional-success/10 text-functional-success'
                    : 'bg-surface-subtle text-brand-muted'}`} aria-live="polite">
                    {loading ? 'Carregando' : status}
                  </span>
                </div>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-brand-muted">{automation.description}</p>
                {control && !control.auditor_ready && <p className="mt-2 text-xs text-functional-warning">Configure um auditor de qualidade ativo para ligar esta fila.</p>}
                {capped && <p className="mt-2 text-xs text-functional-warning">O limite de avaliações deste ambiente foi atingido.</p>}
                {control?.last_error && <p className="mt-2 text-xs text-functional-warning">Última falha de captura: {control.last_error}</p>}
              </div>
              {canToggle && !staging && (
                <Button type="button" size="sm" variant={control?.enabled ? 'outline' : 'primary'}
                  icon={control?.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  loading={busy === automation.id}
                  disabled={!control || loading || busy !== null || (!control.enabled && (capped || !control.auditor_ready))}
                  onClick={() => { if (control) void toggle(control); }}
                  aria-label={`${control?.enabled ? 'Desligar' : 'Ligar'} avaliação automática de ${automation.title}`}>
                  {busy === automation.id ? 'Salvando...' : control?.enabled ? 'Desligar' : 'Ligar'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {!canToggle && <p className="text-xs text-brand-muted">Somente administradores e gestores de qualidade podem alterar estas automações.</p>}
    </section>
  );
}
