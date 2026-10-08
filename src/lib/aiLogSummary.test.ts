import { describe, expect, it } from 'vitest';
import type { AIEvaluationLog } from '../types';
import { getAiLogSummary, getAiLogTokenUsage, matchesAiLogStatus } from './aiLogSummary';

describe('resumo dos logs de IA', () => {
  it('mostra a falha do GLM e o Gemma usado no chamado 179371', () => {
    const log = {
      id: 'log-179371', ticket_id: '179371', evaluation_type: 'chamado_filho',
      provider: 'openrouter', model: 'google/gemma-4-31b-it', status: 'success',
      fallback_used: true, created_at: '2026-10-06T12:49:18Z',
      attempts: [
        { provider: 'openrouter', model: 'z-ai/glm-5.3-flash', attempt: 1, status: 'failed', reason: 'timeout', durationMs: 30002 },
        { provider: 'openrouter', model: 'google/gemma-4-31b-it', attempt: 1, status: 'success', durationMs: 12632 },
      ],
    } satisfies AIEvaluationLog;
    expect(getAiLogSummary(log)).toMatchObject({ fallbackUsed: true, finalModel: 'google/gemma-4-31b-it', hadRecoverableError: true });
    expect(getAiLogSummary(log).failedAttempts).toHaveLength(1);
    expect(matchesAiLogStatus(log, 'error')).toBe(true);
    expect(matchesAiLogStatus(log, 'success')).toBe(true);
  });

  it('distingue consumo informado pelo provedor de tentativas sem resposta', () => {
    const log = {
      id: 'log-usage', ticket_id: '123', evaluation_type: 'chamado_filho',
      provider: 'openrouter', model: 'google/gemma-4-31b-it', status: 'success',
      created_at: '2026-10-08T12:00:00Z',
      attempts: [
        { provider: 'openrouter', model: 'z-ai/glm-5.3-flash', attempt: 1, status: 'failed' },
        { provider: 'openrouter', model: 'google/gemma-4-31b-it', attempt: 1, status: 'success', promptTokens: 2200, completionTokens: 430 },
      ],
    } satisfies AIEvaluationLog;
    expect(getAiLogTokenUsage(log)).toEqual({ input: 2200, output: 430 });
    expect(getAiLogTokenUsage({ ...log, attempts: [log.attempts[0]] })).toEqual({ input: null, output: null });
  });
});
