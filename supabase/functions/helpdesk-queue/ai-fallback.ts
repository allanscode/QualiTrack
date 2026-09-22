export type AIProvider = 'gemini' | 'openrouter';

export type AIFailureReason =
  | 'timeout'
  | 'rate_limit'
  | 'server_error'
  | 'empty_response'
  | 'invalid_json'
  | 'response_parse_error'
  | 'incomplete_response'
  | 'credentials_error'
  | 'model_not_found'
  | 'request_configuration_error'
  | 'network_error'
  | 'unknown_error';

export interface AIModelTarget {
  provider: AIProvider;
  model: string;
  maxAttempts: number;
}

export interface AIAttemptRecord {
  provider: AIProvider;
  model: string;
  attempt: number;
  status: 'success' | 'failed';
  reason?: AIFailureReason;
  message?: string;
  httpStatus?: number;
  durationMs: number;
}

export interface AIChainResult<T> {
  value: T;
  provider: AIProvider;
  model: string;
  attempts: AIAttemptRecord[];
  fallbackUsed: boolean;
}

export class AIModelError extends Error {
  constructor(
    message: string,
    public readonly reason: AIFailureReason,
    public readonly retryable: boolean,
    public readonly scope: 'attempt' | 'provider' | 'global' = 'attempt',
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'AIModelError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeAIError(error: unknown): AIModelError {
  if (error instanceof AIModelError) return error;
  const message = errorMessage(error);
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError' || /timed?\s*out|timeout/i.test(message)) {
    return new AIModelError(message, 'timeout', true);
  }
  if (/fetch|network|connection|socket|dns/i.test(message)) {
    return new AIModelError(message, 'network_error', true);
  }
  return new AIModelError(message, 'unknown_error', true);
}

export async function httpAIError(provider: AIProvider, model: string, response: Response): Promise<AIModelError> {
  const body = (await response.text().catch(() => '')).slice(0, 1200);
  const detail = `${provider}/${model} retornou HTTP ${response.status}${body ? `: ${body}` : ''}`;
  if (response.status === 429) return new AIModelError(detail, 'rate_limit', true, 'attempt', 429);
  if (response.status >= 500) return new AIModelError(detail, 'server_error', true, 'attempt', response.status);
  if (response.status === 401 || response.status === 403) {
    return new AIModelError(detail, 'credentials_error', false, 'provider', response.status);
  }
  if (response.status === 404) {
    return new AIModelError(detail, 'model_not_found', false, 'attempt', 404);
  }
  if (response.status === 400) {
    return new AIModelError(detail, 'request_configuration_error', false, 'provider', 400);
  }
  return new AIModelError(detail, 'request_configuration_error', false, 'attempt', response.status);
}

export function parseModelJSON(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new AIModelError('O modelo retornou uma resposta vazia.', 'empty_response', true);
  const match = trimmed.match(/\{[\s\S]*\}/);
  const candidate = match
    ? match[0]
    : trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new AIModelError(`JSON inválido: ${errorMessage(error)}`, 'invalid_json', true);
  }
}

export function incompleteResponse(message: string): never {
  throw new AIModelError(message, 'incomplete_response', true);
}

export interface RunAIModelChainOptions<T> {
  targets: AIModelTarget[];
  execute: (target: AIModelTarget, attempt: number) => Promise<{ value: T; actualModel?: string }>;
  onAttempt?: (record: AIAttemptRecord, nextTarget?: AIModelTarget) => void;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function runAIModelChain<T>(options: RunAIModelChainOptions<T>): Promise<AIChainResult<T>> {
  if (options.targets.length === 0) {
    throw new AIModelError('Nenhum modelo de IA configurado.', 'request_configuration_error', false, 'global');
  }

  const attempts: AIAttemptRecord[] = [];
  const sleep = options.sleep || ((milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds)));
  let lastError: AIModelError | undefined;

  for (let targetIndex = 0; targetIndex < options.targets.length; targetIndex++) {
    const target = options.targets[targetIndex];
    for (let attempt = 1; attempt <= target.maxAttempts; attempt++) {
      const startedAt = Date.now();
      try {
        const result = await options.execute(target, attempt);
        const record: AIAttemptRecord = {
          provider: target.provider,
          model: result.actualModel || target.model,
          attempt,
          status: 'success',
          durationMs: Date.now() - startedAt,
        };
        attempts.push(record);
        options.onAttempt?.(record);
        return {
          value: result.value,
          provider: target.provider,
          model: result.actualModel || target.model,
          attempts,
          fallbackUsed: targetIndex > 0,
        };
      } catch (error) {
        const normalized = normalizeAIError(error);
        lastError = normalized;
        const shouldRetry = normalized.retryable && attempt < target.maxAttempts;
        const nextTarget = shouldRetry ? target : options.targets[targetIndex + 1];
        const record: AIAttemptRecord = {
          provider: target.provider,
          model: target.model,
          attempt,
          status: 'failed',
          reason: normalized.reason,
          message: normalized.message,
          httpStatus: normalized.httpStatus,
          durationMs: Date.now() - startedAt,
        };
        attempts.push(record);
        options.onAttempt?.(record, nextTarget);

        if (normalized.scope === 'global') {
          throw Object.assign(normalized, { attempts });
        }
        if (normalized.scope === 'provider') {
          while (targetIndex + 1 < options.targets.length
            && options.targets[targetIndex + 1].provider === target.provider) {
            targetIndex++;
          }
          break;
        }
        if (!shouldRetry) break;
        await sleep(attempt === 1 ? 400 : 1200);
      }
    }
  }

  throw Object.assign(
    lastError || new AIModelError('Todos os modelos de IA falharam.', 'unknown_error', true),
    { attempts },
  );
}
