import { describe, expect, it, vi } from 'vitest';
import {
  AIModelError,
  incompleteResponse,
  parseModelJSON,
  runAIModelChain,
  type AIModelTarget,
} from './ai-fallback';

const targets: AIModelTarget[] = [
  { provider: 'gemini', model: 'gemini-primary', maxAttempts: 3 },
  { provider: 'openrouter', model: 'fallback-one', maxAttempts: 1 },
  { provider: 'openrouter', model: 'fallback-two', maxAttempts: 1 },
];

const noSleep = async () => undefined;

describe('AI fallback pipeline', () => {
  it('retorna imediatamente quando o Gemini funciona', async () => {
    const execute = vi.fn(async target => ({ value: { model: target.model } }));
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(result.model).toBe('gemini-primary');
    expect(result.fallbackUsed).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['HTTP 500', new AIModelError('500', 'server_error', true, 'attempt', 500)],
    ['timeout', new AIModelError('timeout', 'timeout', true)],
    ['HTTP 429', new AIModelError('429', 'rate_limit', true, 'attempt', 429)],
    ['JSON inválido', () => parseModelJSON('{invalido')],
    ['resposta incompleta', () => incompleteResponse('answers ausente')],
  ])('tenta o Gemini três vezes e chama o próximo modelo em %s', async (_label, failure) => {
    const calls: string[] = [];
    const execute = vi.fn(async (target: AIModelTarget) => {
      calls.push(target.model);
      if (target.provider === 'gemini') {
        if (typeof failure === 'function') failure();
        throw failure;
      }
      return { value: { model: target.model } };
    });
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(calls).toEqual(['gemini-primary', 'gemini-primary', 'gemini-primary', 'fallback-one']);
    expect(result.model).toBe('fallback-one');
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts).toHaveLength(4);
  });

  it('avança por todos os fallbacks quando o Gemini falha em todas as tentativas', async () => {
    const calls: string[] = [];
    const execute = async (target: AIModelTarget) => {
      calls.push(target.model);
      if (target.model !== 'fallback-two') throw new AIModelError('falha simulada', 'server_error', true);
      return { value: 'resultado final' };
    };
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(calls).toEqual([
      'gemini-primary', 'gemini-primary', 'gemini-primary', 'fallback-one', 'fallback-two',
    ]);
    expect(result.value).toBe('resultado final');
  });

  it('não insiste em credencial inválida e identifica a causa antes do próximo provedor', async () => {
    const calls: string[] = [];
    const result = await runAIModelChain({
      targets,
      sleep: noSleep,
      execute: async target => {
        calls.push(target.model);
        if (target.provider === 'gemini') {
          throw new AIModelError('API key inválida', 'credentials_error', false, 'provider', 401);
        }
        return { value: 'fallback válido' };
      },
    });
    expect(calls).toEqual(['gemini-primary', 'fallback-one']);
    expect(result.attempts[0]).toMatchObject({ reason: 'credentials_error', httpStatus: 401 });
  });

  it('interrompe toda a cadeia quando a configuração da requisição é globalmente inválida', async () => {
    const execute = vi.fn(async () => {
      throw new AIModelError('schema inválido', 'request_configuration_error', false, 'global', 400);
    });
    await expect(runAIModelChain({ targets, execute, sleep: noSleep })).rejects.toMatchObject({
      reason: 'request_configuration_error',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
