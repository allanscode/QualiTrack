import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAITargets } from './ai-targets';
import { runAIModelChain, type AIModelTarget } from './ai-fallback';

afterEach(() => vi.useRealTimers());

describe('limites independentes da cadeia de IA', () => {
  it('não propaga o limite principal aos fallbacks', () => {
    const settings: Record<string, string> = { AI_PRIMARY_TIMEOUT_MS: '90000', AI_GEMMA_TIMEOUT_MS: '45000' };
    expect(buildAITargets(name => settings[name]).map(target => target.timeoutMs)).toEqual([90_000, 45_000, 40_000]);
  });

  it.each(['', 'NaN', 'Infinity', '-1', '0'])('usa defaults seguros para configuração inválida %s', value => {
    expect(buildAITargets(() => value).map(target => target.timeoutMs)).toEqual([60_000, 40_000, 40_000]);
  });

  it('aceita resposta do GLM após 30 segundos sem iniciar fallback', async () => {
    vi.useFakeTimers();
    const execute = vi.fn(() => new Promise<{ value: string }>(resolve => setTimeout(() => resolve({ value: 'parecer' }), 45_000)));
    const pending = runAIModelChain({ targets: buildAITargets(() => undefined), execute });
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await pending).toMatchObject({ value: 'parecer', fallbackUsed: false });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('interrompe o GLM aos 60 segundos e permite 35 segundos ao Gemma', async () => {
    vi.useFakeTimers();
    const targets = buildAITargets(() => undefined);
    let primarySignal: AbortSignal | undefined;
    const execute = vi.fn((target: AIModelTarget, _attempt: number, signal: AbortSignal) => {
      if (target.model === targets[0].model) {
        primarySignal = signal;
        return new Promise<{ value: string }>(() => undefined);
      }
      return new Promise<{ value: string }>(resolve => setTimeout(() => resolve({ value: 'fallback' }), 35_000));
    });
    const pending = runAIModelChain({ targets, execute });
    await vi.advanceTimersByTimeAsync(95_000);
    expect(await pending).toMatchObject({ value: 'fallback', fallbackUsed: true });
    expect(primarySignal?.aborted).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
