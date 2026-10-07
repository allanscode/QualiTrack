import type { AIModelTarget } from './ai-fallback.ts';
import { OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODELS } from './openrouter-client.ts';

type ReadSetting = (name: string) => string | undefined;

function timeoutMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(120_000, Math.max(1_000, Math.floor(parsed))) : fallback;
}

/** Each model shares its own time budget across retries, not the primary's budget. */
export function buildAITargets(readSetting: ReadSetting): AIModelTarget[] {
  const budgets = [
    timeoutMs(readSetting('AI_PRIMARY_TIMEOUT_MS'), 60_000),
    timeoutMs(readSetting('AI_GEMMA_TIMEOUT_MS'), 40_000),
    timeoutMs(readSetting('AI_GEMINI_TIMEOUT_MS'), 40_000),
  ];
  return [OPENROUTER_MODEL, ...OPENROUTER_FALLBACK_MODELS].map((model, index) => ({
    provider: 'openrouter', model, maxAttempts: 2, timeoutMs: budgets[index],
  }));
}
