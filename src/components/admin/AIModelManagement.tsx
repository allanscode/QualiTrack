import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getAIModelConfig, listOpenRouterModels, setAIModelConfig, type OpenRouterModelOption } from '../../lib/aiModelConfig';
import Button from '../ui/Button';

function price(value: string | undefined): string {
  if (value === undefined || value === '' || !Number.isFinite(Number(value))) return 'preço indisponível';
  const perMillion = Number(value) * 1_000_000;
  return `$${perMillion.toFixed(perMillion > 0 && perMillion < 0.01 ? 4 : 2)}/1 mi tokens`;
}

export default function AIModelManagement() {
  const [models, setModels] = useState<OpenRouterModelOption[]>([]);
  const [current, setCurrent] = useState('');
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [modelId, catalog] = await Promise.all([getAIModelConfig(), listOpenRouterModels()]);
      setCurrent(modelId);
      setSelected(modelId);
      setModels(catalog);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar modelos.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => models.filter(model =>
    `${model.name} ${model.id}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 100), [models, search]);
  const chosen = models.find(model => model.id === selected);
  const save = async () => {
    if (!chosen || selected === current) return;
    setBusy(true);
    try { await setAIModelConfig(selected); setCurrent(selected); setError(''); toast.success('Modelo de avaliação atualizado.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar modelo.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-surface-border bg-surface-card p-5 sm:p-6" aria-labelledby="ai-model-title">
    <h3 id="ai-model-title" className="text-base font-bold text-brand-primary">Modelo das avaliações OpenRouter</h3>
    <p className="mt-1 text-sm text-brand-muted">Modelo principal usado nas monitorias e nas próximas reavaliações candidatas. Modelos gratuitos podem ter limites de requisição do provedor e produzir avaliações de qualidade diferente.</p>
    <p className="mt-3 text-xs text-brand-muted">Atual: <strong className="font-mono text-brand-primary">{current || 'Carregando...'}</strong></p>
    <label htmlFor="ai-model-search" className="mt-4 block text-xs font-semibold text-brand-primary">Buscar no catálogo OpenRouter</label>
    <input id="ai-model-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou ID do modelo"
      className="mt-1 w-full rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-brand-primary" />
    <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-surface-border" role="radiogroup" aria-label="Modelos de texto">
      {visible.map(model => <label key={model.id} className="flex cursor-pointer items-start gap-3 border-b border-surface-border p-3 text-sm last:border-b-0 hover:bg-surface-subtle">
        <input type="radio" name="ai-model" value={model.id} checked={selected === model.id} onChange={() => setSelected(model.id)} disabled={busy} />
        <span className="min-w-0"><strong className="block text-brand-primary">{model.name} {model.free && <span className="text-functional-success">· Grátis</span>}</strong>
          <span className="block break-all font-mono text-xs text-brand-muted">{model.id}</span>
          <span className="block text-xs text-brand-muted">Entrada: {price(model.pricing?.prompt)} · Saída: {price(model.pricing?.completion)}</span>
          {model.pricing?.request && Number(model.pricing.request) > 0 &&
            <span className="block text-xs text-brand-muted">Por requisição: ${Number(model.pricing.request).toFixed(4)}</span>}
        </span>
      </label>)}
      {!visible.length && <p className="p-3 text-sm text-brand-muted">Nenhum modelo de texto encontrado.</p>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-functional-error">{error}</p>}
    <div className="mt-4 flex gap-2"><Button type="button" onClick={() => void save()} disabled={busy || !chosen || selected === current}>Salvar modelo</Button>
      <Button type="button" variant="outline" onClick={() => void load()} disabled={busy}>Atualizar catálogo</Button></div>
  </section>;
}
