import { describe, expect, it, vi } from 'vitest';
import { callOpenRouter, OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODEL } from './openrouter-client';
import { runAIModelChain } from './ai-fallback';

const testKey = 'test-key-not-real';
const responseSchema = {
  type: 'object', properties: { score: { type: 'number' } }, required: ['score'], additionalProperties: false,
};
const success = (provider = 'DeepInfra') => Response.json({
  model: OPENROUTER_MODEL,
  choices: [{ message: { content: '{"score":90}' } }],
  openrouter_metadata: { attempt: 2, endpoints: { available: [{ provider, selected: true }] } },
});

describe('requisição OpenRouter', () => {
  it('usa apenas GLM 5.3 Flash, JSON Schema e provider failover; chave somente no header', async () => {
    const fetcher = vi.fn(async () => success());
    const result = await callOpenRouter({ prompt: 'Avalie', responseSchema, apiKey: testKey, fetcher });
    expect(result).toMatchObject({ text: '{"score":90}', routedProvider: 'DeepInfra', routerAttempt: 2 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(url).not.toContain(testKey);
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${testKey}`, 'X-OpenRouter-Metadata': 'enabled' });
    expect(init.body).not.toContain(testKey);
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('z-ai/glm-5.3-flash');
    expect(body.models).toBeUndefined();
    expect(body.provider).toEqual({ allow_fallbacks: true, require_parameters: true });
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'wp_quality_evaluation', strict: true, schema: responseSchema } });
  });

  it.each([429, 500, 503])('repete HTTP %i e conclui no mesmo modelo', async status => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('erro privado', { status })).mockResolvedValueOnce(success('Fireworks'));
    const result = await runAIModelChain({
      targets: [{ provider: 'openrouter', model: OPENROUTER_MODEL, maxAttempts: 4 }, { provider: 'openrouter', model: OPENROUTER_FALLBACK_MODEL, maxAttempts: 3 }],
      execute: async () => {
        const response = await callOpenRouter({ prompt: 'Avalie', responseSchema, apiKey: testKey, fetcher });
        return { value: response.text, routedProvider: response.routedProvider, routerAttempt: response.routerAttempt };
      },
      sleep: async () => undefined,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.attempts[0].httpStatus).toBe(status);
    expect(result.attempts[1]).toMatchObject({ routedProvider: 'Fireworks', routerAttempt: 2 });
    expect(result.fallbackUsed).toBe(false);
  });

  it('não repete 401 nem expõe detalhes do provedor', async () => {
    const fetcher = vi.fn(async () => new Response('informação privada', { status: 401 }));
    await expect(runAIModelChain({
      targets: [{ provider: 'openrouter', model: OPENROUTER_MODEL, maxAttempts: 4 }, { provider: 'openrouter', model: OPENROUTER_FALLBACK_MODEL, maxAttempts: 3 }],
      execute: async () => ({ value: await callOpenRouter({ prompt: 'Avalie', responseSchema, apiKey: testKey, fetcher }) }),
      sleep: async () => undefined,
    })).rejects.toMatchObject({ reason: 'credentials_error' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejeita resposta de outro modelo', async () => {
    const fetcher = vi.fn(async () => Response.json({ model: 'outro/modelo', choices: [{ message: { content: '{}' } }] }));
    await expect(callOpenRouter({ prompt: 'Avalie', responseSchema, apiKey: testKey, fetcher }))
      .rejects.toMatchObject({ reason: 'request_configuration_error' });
  });

  it('envia Gemini pago pela mesma API e captura metadados de consumo', async () => {
    const fetcher = vi.fn(async () => Response.json({
      id: 'gen-test', model: OPENROUTER_FALLBACK_MODEL,
      choices: [{ message: { content: '{"score":90}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 },
    }));
    const result = await callOpenRouter({ prompt: 'Avalie', responseSchema, apiKey: testKey, model: OPENROUTER_FALLBACK_MODEL, fetcher });
    expect(result).toMatchObject({ requestId: 'gen-test', promptTokens: 100, completionTokens: 20, cost: 0.001 });
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe(OPENROUTER_FALLBACK_MODEL);
    expect(body.model).not.toContain(':free');
    expect(body.provider.allow_fallbacks).toBe(true);
  });
});
