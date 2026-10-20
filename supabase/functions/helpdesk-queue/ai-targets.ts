import type { AIModelTarget } from './ai-fallback.ts';
import { OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODELS, OPENROUTER_FREE_FALLBACK_MODELS } from './openrouter-client.ts';

type ReadSetting = (name: string) => string | undefined;

function timeoutMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(120_000, Math.max(1_000, Math.floor(parsed))) : fallback;
}

/** Each model shares its own time budget across retries, not the primary's budget. */
export function buildAITargets(readSetting: ReadSetting, selectedModel = OPENROUTER_MODEL, selectedIsFree = false): AIModelTarget[] {
  const budgets = [
    timeoutMs(readSetting('AI_PRIMARY_TIMEOUT_MS'), 120_000),
    timeoutMs(readSetting('AI_GEMMA_TIMEOUT_MS'), 40_000),
  ];
  if (selectedIsFree) {
    const models = [selectedModel, ...OPENROUTER_FREE_FALLBACK_MODELS.filter(model => model !== selectedModel)];
    const poolsideBudget = Math.min(60_000, Math.floor(budgets[0] / 2));
    const otherBudget = Math.floor((budgets[0] - poolsideBudget) / Math.max(1, models.length - 1));
    return models.map(model => ({
      provider: 'openrouter', model, maxAttempts: 1,
      timeoutMs: model === 'poolside/laguna-s-2.1:free' ? poolsideBudget : otherBudget,
    }));
  }
  const models = [selectedModel, ...OPENROUTER_FALLBACK_MODELS.filter(model => model !== selectedModel)];
  return models.map((model, index) => ({
    provider: 'openrouter', model, maxAttempts: 2, timeoutMs: budgets[index],
  }));
}
