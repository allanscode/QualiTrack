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
