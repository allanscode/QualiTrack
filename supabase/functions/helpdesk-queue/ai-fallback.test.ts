import { describe, expect, it, vi } from 'vitest';
import { AIModelError, httpAIError, runAIModelChain, type AIModelTarget } from './ai-fallback';

const targets: AIModelTarget[] = [
  { provider: 'openrouter', model: 'z-ai/glm-5.3-flash', maxAttempts: 4, timeoutMs: 30_000 },
  { provider: 'openrouter', model: 'google/gemini-3.8-flash', maxAttempts: 3, timeoutMs: 45_000 },
];
const noSleep = async () => undefined;

describe('GLM pago primeiro; Gemini pago somente como contingência', () => {
  it('começa e termina no GLM quando ele responde, mantendo failover de provider', async () => {
    const execute = vi.fn(async (_target: AIModelTarget) => ({ value: 'válida', routedProvider: 'outro provider', routerAttempt: 2 }));
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].model).toBe('z-ai/glm-5.3-flash');
    expect(result).toMatchObject({ model: 'z-ai/glm-5.3-flash', fallbackUsed: false, routerAttempt: 2 });
  });

  it.each([429, 500, 503])('faz retry do GLM em HTTP %i antes de usar Gemini', async status => {
    const execute = vi.fn(async (target: AIModelTarget, attempt: number) => {
      if (target.model === targets[0].model && attempt < 4)
        throw new AIModelError('falha', status === 429 ? 'rate_limit' : 'server_error', true, 'attempt', status);
      return { value: 'válida' };
    });
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(result.model).toBe(targets[0].model);
    expect(result.fallbackUsed).toBe(false);
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('usa Gemini após esgotar retries do GLM e conclui com um único resultado', async () => {
    const execute = vi.fn(async (target: AIModelTarget) => {
      if (target.model === targets[0].model) throw new AIModelError('500', 'server_error', true, 'attempt', 500);
      return { value: { summary: 'Gemini concluiu' } };
    });
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(result.value).toEqual({ summary: 'Gemini concluiu' });
    expect(result.model).toBe(targets[1].model);
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts.map(attempt => attempt.model)).toEqual([
      targets[0].model, targets[0].model, targets[0].model, targets[0].model, targets[1].model,
    ]);
  });

  it('timeout do GLM aborta e descarta resposta tardia', async () => {
    let finishLate!: (value: { value: string }) => void;
    const shortTargets = [{ ...targets[0], maxAttempts: 1, timeoutMs: 15 }, targets[1]];
    const execute = vi.fn((target: AIModelTarget) => target.model === targets[0].model
      ? new Promise<{ value: string }>(resolve => { finishLate = resolve; })
      : Promise.resolve({ value: 'Gemini venceu' }));
    const result = await runAIModelChain({ targets: shortTargets, execute, sleep: noSleep });
    finishLate({ value: 'GLM atrasado' });
    expect(result.value).toBe('Gemini venceu');
    expect(result.attempts[0].reason).toBe('timeout');
    expect(result.attempts[1].model).toBe(targets[1].model);
  });

  it('cancelamento manual aborta sem retry nem Gemini', async () => {
    const controller = new AbortController();
    const execute = vi.fn((_target: AIModelTarget, _attempt: number, signal: AbortSignal) =>
      new Promise<{ value: string }>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort')), { once: true })));
    const pending = runAIModelChain({ targets, execute, signal: controller.signal, sleep: noSleep });
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ reason: 'cancelled' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('ambos falham e preserva histórico das sete tentativas para reprocessamento', async () => {
    const execute = vi.fn(async () => { throw new AIModelError('429', 'rate_limit', true, 'attempt', 429); });
    await expect(runAIModelChain({ targets, execute, sleep: noSleep }))
      .rejects.toMatchObject({ reason: 'rate_limit', attempts: expect.arrayContaining([expect.objectContaining({ model: targets[1].model, attempt: 3 })]) });
    expect(execute).toHaveBeenCalledTimes(7);
  });

  it.each([400, 401, 403])('erro global HTTP %i não chama Gemini', async status => {
    const error = await httpAIError('openrouter', targets[0].model, new Response('segredo', { status }));
    const execute = vi.fn(async () => { throw error; });
    await expect(runAIModelChain({ targets, execute, sleep: noSleep })).rejects.toMatchObject({ httpStatus: status });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(error.message).not.toContain('segredo');
  });

  it('recusa modelo gratuito ou ordem invertida', async () => {
    const execute = vi.fn();
    await expect(runAIModelChain({ targets: [{ ...targets[0], model: `${targets[0].model}:free` }, targets[1]], execute }))
      .rejects.toMatchObject({ reason: 'request_configuration_error' });
    expect(execute).not.toHaveBeenCalled();
  });
});
