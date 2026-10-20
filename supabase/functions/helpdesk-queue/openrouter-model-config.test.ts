import { describe, expect, it, vi } from 'vitest';
import { configuredModel, fetchTextModels, isFreeModel, textModels } from './openrouter-model-config';
import { buildAITargets } from './ai-targets';
import { OPENROUTER_MODEL } from './openrouter-client';

const model = (id: string, input: string[], output: string[], pricing: { prompt?: string; completion?: string; request?: string } | null) =>
  ({ id, name: id, architecture: { input_modalities: input, output_modalities: output }, pricing });

describe('OpenRouter model configuration', () => {
  it('accepts only catalog models with text input and text-only output', () => {
    const catalog = textModels({ data: [
      model('provider/text:free', ['text'], ['text'], { prompt: '0', completion: '0' }),
      model('provider/image', ['text'], ['image'], null),
      model('provider/embedding', ['text'], [], null),
      model('provider/audio', ['audio'], ['text'], null),
    ] });
    expect(catalog.map(item => item.id)).toEqual(['provider/text:free']);
    expect(isFreeModel(catalog[0])).toBe(true);
    expect(isFreeModel(model('provider/unknown', ['text'], ['text'], null))).toBe(false);
    expect(isFreeModel(model('provider/partial', ['text'], ['text'], { prompt: '0' }))).toBe(false);
    expect(isFreeModel(model('provider/request-fee', ['text'], ['text'], { prompt: '0', completion: '0', request: '0.01' }))).toBe(false);
  });

  it('loads live metadata without making a model completion request', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [model('provider/text', ['text'], ['text'], null)] }));
    expect((await fetchTextModels('test-key', fetcher)).map(item => item.id)).toEqual(['provider/text']);
    expect(fetcher.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/models');
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer test-key' });
  });

  it('uses the selected primary model and keeps a default when config is absent', async () => {
    const db = (id: string | null) => ({ from: () => ({ select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: id ? { model_id: id, is_free: true } : null, error: null }),
    }) }) }) });
    expect(await configuredModel(db(null) as never)).toEqual({ modelId: OPENROUTER_MODEL, isFree: false });
    const chosen = await configuredModel(db('provider/text:free') as never);
    expect(chosen).toEqual({ modelId: 'provider/text:free', isFree: true });
    expect(buildAITargets(() => undefined, chosen.modelId, chosen.isFree).map(target => target.model)).toEqual([
      'provider/text:free', 'poolside/laguna-s-2.1:free', 'minimax/minimax-m3.1-flash:free', 'google/gemma-4-31b-it:free',
    ]);
    expect(buildAITargets(() => undefined)[0].model).toBe(OPENROUTER_MODEL);
  });
});
