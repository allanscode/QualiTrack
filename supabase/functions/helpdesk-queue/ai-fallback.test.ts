import { describe, expect, it, vi } from 'vitest';
import {
  AIModelError,
  httpAIError,
  incompleteResponse,
  parseModelJSON,
  runAIModelChain,
  type AIModelTarget,
} from './ai-fallback';

const targets: AIModelTarget[] = [
  { provider: 'openrouter', model: 'z-ai/glm-5.3-flash', maxAttempts: 4 },
];
const noSleep = async () => undefined;

describe('GLM 5.3 Flash exclusivo com retry', () => {
  it('conclui na primeira tentativa quando o OpenRouter responde corretamente', async () => {
    const execute = vi.fn(async target => ({ value: { model: target.model } }));
    const result = await runAIModelChain({ targets, execute, sleep: noSleep });
    expect(result.model).toBe('z-ai/glm-5.3-flash');
    expect(result.fallbackUsed).toBe(false);
    expect(result.attempts).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['HTTP 500', new AIModelError('500', 'server_error', true, 'attempt', 500)],
    ['timeout', new AIModelError('timeout', 'timeout', true)],
    ['HTTP 429', new AIModelError('429', 'rate_limit', true, 'attempt', 429)],
    ['resposta vazia', () => parseModelJSON('')],
    ['JSON inválido', () => parseModelJSON('{invalido')],
    ['erro de parsing', new AIModelError('envelope inválido', 'response_parse_error', true)],
    ['resposta incompleta', () => incompleteResponse('answers ausente')],
  ])('tenta novamente e conclui após %s', async (_label, failure) => {
    const execute = vi.fn(async (_target: AIModelTarget, attempt: number) => {
      if (attempt < 3) {
        if (typeof failure === 'function') failure();
        throw failure;
      }
      return { value: 'avaliação válida' };
    });
    const sleeps: number[] = [];
    const result = await runAIModelChain({ targets, execute, sleep: async ms => { sleeps.push(ms); } });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(result.value).toBe('avaliação válida');
    expect(result.attempts.map(record => record.status)).toEqual(['failed', 'failed', 'success']);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('falha somente após quatro tentativas e três backoffs progressivos', async () => {
    const execute = vi.fn(async () => { throw new AIModelError('indisponível', 'server_error', true); });
    const sleeps: number[] = [];
    await expect(runAIModelChain({ targets, execute, sleep: async ms => { sleeps.push(ms); } }))
      .rejects.toMatchObject({ reason: 'server_error', attempts: expect.arrayContaining([expect.objectContaining({ attempt: 4 })]) });
    expect(execute).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([500, 1000, 2000]);
  });

  it.each([401, 403, 400, 404])('não repete erro definitivo HTTP %i', async status => {
    const error = await httpAIError('openrouter', 'z-ai/glm-5.3-flash', new Response('detalhes privados', { status }));
    const execute = vi.fn(async () => { throw error; });
    await expect(runAIModelChain({ targets, execute, sleep: noSleep })).rejects.toMatchObject({ httpStatus: status });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(error.message).not.toContain('detalhes privados');
  });

  it('recusa qualquer cadeia com outro modelo', async () => {
    const execute = vi.fn();
    await expect(runAIModelChain({ targets: [...targets, ...targets], execute, sleep: noSleep }))
      .rejects.toMatchObject({ reason: 'request_configuration_error' });
    expect(execute).not.toHaveBeenCalled();
  });
});
