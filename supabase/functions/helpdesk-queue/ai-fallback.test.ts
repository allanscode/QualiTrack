import { describe, expect, it, vi } from 'vitest';
import { AIModelError, httpAIError, runAIModelChain, type AIModelTarget } from './ai-fallback';

const targets: AIModelTarget[] = [
  { provider: 'openrouter', model: 'google/gemma-4-31b-it', maxAttempts: 4, timeoutMs: 30_000 },
];
const noSleep = async () => undefined;

describe('Gemma 4 como único modelo de análise', () => {
  it('conclui com Gemma e permite failover entre providers do mesmo modelo', async () => {
    const execute = vi.fn(async () => ({ value: 'válida', routedProvider: 'outro provider', routerAttempt: 2 }));
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ model: targets[0].model, fallbackUsed: false, routerAttempt: 2 });
  });

  it.each([429, 500, 503])('repete Gemma após HTTP %i sem escolher outro modelo', async status => {
    const execute = vi.fn(async (_target: AIModelTarget, attempt: number) => {
      if (attempt < 4) throw new AIModelError('falha', status === 429 ? 'rate_limit' : 'server_error', true, 'attempt', status);
      return { value: 'válida' };
    });
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(result.model).toBe(targets[0].model);
    expect(result.fallbackUsed).toBe(false);
    expect(result.attempts.map(attempt => attempt.model)).toEqual(Array(4).fill(targets[0].model));
  });

  it('falha após esgotar as tentativas sem chamar outro modelo', async () => {
    const execute = vi.fn(async () => { throw new AIModelError('429', 'rate_limit', true, 'attempt', 429); });
    await expect(runAIModelChain({ targets, execute, sleep: noSleep }))
      .rejects.toMatchObject({ reason: 'rate_limit', attempts: expect.arrayContaining([expect.objectContaining({ model: targets[0].model, attempt: 4 })]) });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('descarta resposta recebida depois do timeout', async () => {
    let finishLate!: (value: { value: string }) => void;
    const execute = vi.fn(() => new Promise<{ value: string }>(resolve => { finishLate = resolve; }));
    await expect(runAIModelChain({ targets: [{ ...targets[0], maxAttempts: 1, timeoutMs: 15 }], execute, sleep: noSleep }))
      .rejects.toMatchObject({ reason: 'timeout' });
    finishLate({ value: 'tardia' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('cancelamento manual aborta sem nova tentativa', async () => {
    const controller = new AbortController();
    const execute = vi.fn((_target: AIModelTarget, _attempt: number, signal: AbortSignal) =>
      new Promise<{ value: string }>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort')), { once: true })));
    const pending = runAIModelChain({ targets, execute, signal: controller.signal, sleep: noSleep });
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ reason: 'cancelled' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403])('erro definitivo HTTP %i encerra imediatamente', async status => {
    const error = await httpAIError('openrouter', targets[0].model, new Response('segredo', { status }));
    const execute = vi.fn(async () => { throw error; });
    await expect(runAIModelChain({ targets, execute, sleep: noSleep })).rejects.toMatchObject({ httpStatus: status });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(error.message).not.toContain('segredo');
  });

  it('recusa outro modelo, variante gratuita ou lista de fallback', async () => {
    const execute = vi.fn();
    for (const invalidTargets of [
      [{ ...targets[0], model: 'google/gemma-4-31b-it:free' }],
      [{ ...targets[0], model: 'z-ai/glm-5.3-flash' }],
      [...targets, { ...targets[0], model: 'google/gemini-3.8-flash' }],
    ]) {
      await expect(runAIModelChain({ targets: invalidTargets, execute })).rejects.toMatchObject({ reason: 'request_configuration_error' });
    }
    expect(execute).not.toHaveBeenCalled();
  });
});
