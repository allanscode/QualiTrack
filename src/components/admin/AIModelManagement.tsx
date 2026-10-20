import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DEFAULT_AI_MODEL, getAIModelConfig, setAIModelConfig } from '../../lib/aiModelConfig';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Select from '../ui/Select';

const MODEL_CHOICES = [
  { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', free: false },
  { id: 'google/gemma-4-31b-it', name: 'Gemma 4 31B', free: false },
  { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', free: false },
  { id: 'z-ai/glm-5.3-flash:free', name: 'GLM 5.3 Flash', free: true },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B', free: true },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B A4B', free: true },
  { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning', free: true },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 3 Nano 30B A3B', free: true },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'Nemotron 3 Nano Omni Reasoning', free: true },
] as const;

export default function AIModelManagement() {
  const [current, setCurrent] = useState('');
  const [selected, setSelected] = useState(DEFAULT_AI_MODEL);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const options = useMemo(() => {
    const choices: { value: string; label: string }[] = MODEL_CHOICES.map(model => ({
      value: model.id,
      label: `${model.name} · ${model.free ? 'Gratuito' : 'Pago'} · ${model.id}`,
    }));
    if (current && !MODEL_CHOICES.some(model => model.id === current)) {
      choices.unshift({ value: current, label: `${current} · modelo atual` });
    }
    return choices;
  }, [current]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const modelId = await getAIModelConfig();
      setCurrent(modelId);
      setSelected(modelId);
    } catch (cause) {
      setCurrent(DEFAULT_AI_MODEL);
      setSelected(DEFAULT_AI_MODEL);
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o modelo salvo.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!selected || selected === current) return;
    setBusy(true);
    setError('');
    try {
      await setAIModelConfig(selected);
      setCurrent(selected);
      toast.success('Modelo de avaliação atualizado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o modelo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-5 sm:p-6" aria-labelledby="ai-model-title">
      <h3 id="ai-model-title" className="text-base font-bold text-brand-primary">Modelo das avaliações OpenRouter</h3>
      <p className="mt-1 max-w-4xl text-sm text-brand-muted">
        Escolha o modelo principal para novas avaliações. Modelos gratuitos podem ter limites de requisição do provedor e produzir avaliações de qualidade diferente.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.7fr)] md:items-end">
        <Select
          label="Modelo disponível"
          aria-label="Modelo disponível para avaliações"
          value={selected}
          options={options}
          onChange={event => setSelected(event.target.value)}
          disabled={busy}
        />
        <Card className="min-h-[3.15rem] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-muted">Modelo em uso</p>
          <p className="mt-0.5 break-all font-mono text-xs text-brand-primary">{current || 'Carregando configuração...'}</p>
        </Card>
      </div>

      <p className="mt-2 text-xs text-brand-muted">
        Lista predefinida com os modelos discutidos. A opção gratuita depende dos limites e da disponibilidade de cada provedor.
      </p>
      {error && <p role="alert" className="mt-3 rounded-lg border border-functional-error/30 bg-functional-error/10 px-3 py-2 text-sm text-functional-error">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy || !selected || selected === current}>
          Salvar modelo
        </Button>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={busy}>
          Recarregar configuração
        </Button>
      </div>
    </section>
  );
}
