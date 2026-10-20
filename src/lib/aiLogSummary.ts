import type { AIEvaluationLog } from '../types';

export function getAiLogSummary(log: AIEvaluationLog) {
  const attempts = log.attempts || [];
  const failedAttempts = attempts.filter(attempt => attempt.status === 'failed');
  const successfulAttempt = [...attempts].reverse().find(attempt => attempt.status === 'success');
  const fallbackUsed = Boolean(log.fallback_used || (successfulAttempt && attempts.some(attempt =>
    attempt.model !== successfulAttempt.model && attempt.status === 'failed')));
  return {
    failedAttempts,
    fallbackUsed,
    finalModel: successfulAttempt?.model || log.model,
    hadRecoverableError: log.status === 'success' && failedAttempts.length > 0,
  };
}

export function matchesAiLogStatus(log: AIEvaluationLog, filter: 'all' | 'success' | 'error'): boolean {
  if (filter === 'all') return true;
  if (filter === 'success') return log.status === 'success';
  return log.status === 'error' || getAiLogSummary(log).failedAttempts.length > 0;
}

export function getAiLogTokenUsage(log: AIEvaluationLog): { input: number | null; output: number | null } {
  const attempts = log.attempts || [];
  const sum = (key: 'promptTokens' | 'completionTokens'): number | null => {
    const values = attempts.map(attempt => attempt[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };
  return { input: sum('promptTokens'), output: sum('completionTokens') };
}

export function getAiLogUsage(log: AIEvaluationLog): {
  calls: number;
  cost: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
} {
  const attempts = log.attempts || [];
  const costs = attempts.map(attempt => attempt.cost)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const tokens = getAiLogTokenUsage(log);
  return {
    calls: attempts.length,
    cost: costs.length ? costs.reduce((total, value) => total + value, 0) : null,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
  };
}

export function formatAiLogCost(cost: number | null): string {
  if (cost === null) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 8,
  }).format(cost);
}
