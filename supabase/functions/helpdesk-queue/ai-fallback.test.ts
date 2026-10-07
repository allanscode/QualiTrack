import { describe, expect, it, vi } from 'vitest';
import { AIModelError, httpAIError, runAIModelChain, type AIModelTarget } from './ai-fallback';
import { OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODELS } from './openrouter-client';

const targets: AIModelTarget[] = [OPENROUTER_MODEL, ...OPENROUTER_FALLBACK_MODELS].map(model => ({
  provider: 'openrouter', model, maxAttempts: 2, timeoutMs: 30_000,
}));
const noSleep = async () => undefined;

describe('cadeia paga GLM e Gemma', () => {
  it('começa e termina no GLM quando ele responde', async () => {
    const execute = vi.fn(async (_target: AIModelTarget) => ({ value: 'válida', routedProvider: 'outro provider', routerAttempt: 2 }));
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].model).toBe(OPENROUTER_MODEL);
    expect(result).toMatchObject({ model: OPENROUTER_MODEL, fallbackUsed: false, routerAttempt: 2 });
  });

  it.each([429, 500, 503])('repete o GLM em HTTP %i antes de trocar de modelo', async status => {
    const execute = vi.fn(async (target: AIModelTarget, attempt: number) => {
      if (target.model === targets[0].model && attempt === 1)
        throw new AIModelError('falha', status === 429 ? 'rate_limit' : 'server_error', true, 'attempt', status);
      return { value: 'válida' };
    });
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(result.model).toBe(targets[0].model);
    expect(result.fallbackUsed).toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('usa Gemma após esgotar o GLM e registra a sequência', async () => {
    const execute = vi.fn(async (target: AIModelTarget) => {
      if (target.model === targets[0].model) throw new AIModelError('500', 'server_error', true, 'attempt', 500);
      return { value: { summary: 'Gemma concluiu' } };
    });
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(result.value).toEqual({ summary: 'Gemma concluiu' });
    expect(result.model).toBe(targets[1].model);
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts.map(attempt => attempt.model)).toEqual([targets[0].model, targets[0].model, targets[1].model]);
  });

  it('encerra após GLM e Gemma falharem sem chamar Gemini', async () => {
    const execute = vi.fn(async (_target: AIModelTarget) => {
      throw new AIModelError('500', 'server_error', true, 'attempt', 500);
    });
    await expect(runAIModelChain({ targets, execute, sleep: noSleep })).rejects.toMatchObject({ reason: 'server_error' });
    expect(execute.mock.calls.map(([target]) => target.model)).toEqual([
      'z-ai/glm-5.3-flash', 'z-ai/glm-5.3-flash', 'google/gemma-4-31b-it', 'google/gemma-4-31b-it',
    ]);
  });

  it('timeout do GLM aborta e descarta resposta tardia', async () => {
    let finishLate!: (value: { value: string }) => void;
    const shortTargets = [{ ...targets[0], maxAttempts: 1, timeoutMs: 15 }, targets[1]];
    const execute = vi.fn((target: AIModelTarget) => target.model === targets[0].model
      ? new Promise<{ value: string }>(resolve => { finishLate = resolve; })
      : Promise.resolve({ value: 'Gemma venceu' }));
    const result = await runAIModelChain({ targets: shortTargets, execute, sleep: noSleep });
    finishLate({ value: 'GLM atrasado' });
    expect(result.value).toBe('Gemma venceu');
    expect(result.attempts[0].reason).toBe('timeout');
    expect(result.attempts[1].model).toBe(targets[1].model);
  });

  it('cancelamento manual aborta a cadeia', async () => {
    const controller = new AbortController();
    const execute = vi.fn((_target: AIModelTarget, _attempt: number, signal: AbortSignal) =>
      new Promise<{ value: string }>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort')), { once: true })));
    const pending = runAIModelChain({ targets, execute, signal: controller.signal, sleep: noSleep });
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ reason: 'cancelled' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('preserva o histórico das quatro tentativas quando todos falham', async () => {
    const execute = vi.fn(async () => { throw new AIModelError('429', 'rate_limit', true, 'attempt', 429); });
    await expect(runAIModelChain({ targets, execute, sleep: noSleep }))
      .rejects.toMatchObject({ reason: 'rate_limit', attempts: expect.arrayContaining([expect.objectContaining({ model: targets[1].model, attempt: 2 })]) });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it.each([400, 401, 403])('erro global HTTP %i interrompe a cadeia', async status => {
    const error = await httpAIError('openrouter', targets[0].model, new Response('segredo', { status }));
    const execute = vi.fn(async () => { throw error; });
    await expect(runAIModelChain({ targets, execute, sleep: noSleep })).rejects.toMatchObject({ httpStatus: status });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(error.message).not.toContain('segredo');
  });

  it('recusa cadeia vazia', async () => {
    const execute = vi.fn();
    await expect(runAIModelChain({ targets: [], execute }))
      .rejects.toMatchObject({ reason: 'request_configuration_error' });
    expect(execute).not.toHaveBeenCalled();
  });
});
