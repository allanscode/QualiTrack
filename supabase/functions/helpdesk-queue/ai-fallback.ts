export type AIProvider = 'openrouter';

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
  | 'cancelled'
  | 'unknown_error';

export interface AIModelTarget {
  provider: AIProvider;
  model: string;
  maxAttempts: number;
  timeoutMs?: number;
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
  routedProvider?: string;
  routerAttempt?: number;
  startedAt?: string;
  finishedAt?: string;
  requestId?: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
}

export interface AIChainResult<T> {
  value: T;
  provider: AIProvider;
  model: string;
  attempts: AIAttemptRecord[];
  fallbackUsed: boolean;
  routedProvider?: string;
  routerAttempt?: number;
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
    return new AIModelError('Tempo limite excedido ao chamar OpenRouter.', 'timeout', true);
  }
  if (/fetch|network|connection|socket|dns/i.test(message)) {
    return new AIModelError('Falha de rede ao chamar OpenRouter.', 'network_error', true);
  }
  return new AIModelError('Falha inesperada ao chamar OpenRouter.', 'unknown_error', true);
}

export async function httpAIError(provider: AIProvider, model: string, response: Response): Promise<AIModelError> {
  // Nunca incluir o corpo do provedor: ele pode ecoar dados da requisição.
  const detail = `${provider}/${model} retornou HTTP ${response.status}`;
  if (response.status === 429) return new AIModelError(detail, 'rate_limit', true, 'attempt', 429);
  if (response.status === 408) return new AIModelError(detail, 'timeout', true, 'attempt', 408);
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
  } catch {
    throw new AIModelError('JSON inválido na resposta do modelo.', 'invalid_json', true);
  }
}

export function incompleteResponse(message: string): never {
  throw new AIModelError(message, 'incomplete_response', true);
}

export interface RunAIModelChainOptions<T> {
  targets: AIModelTarget[];
  execute: (target: AIModelTarget, attempt: number, signal: AbortSignal) => Promise<{ value: T; actualModel?: string; routedProvider?: string; routerAttempt?: number; requestId?: string; promptTokens?: number; completionTokens?: number; cost?: number }>;
  onAttempt?: (record: AIAttemptRecord) => void;
  onTargetStart?: (target: AIModelTarget) => Promise<void>;
  signal?: AbortSignal;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function runAIModelChain<T>(options: RunAIModelChainOptions<T>): Promise<AIChainResult<T>> {
  if (options.targets.length !== 2 || options.targets.some(target => target.provider !== 'openrouter')
    || options.targets[0].model !== 'z-ai/glm-5.3-flash'
    || options.targets[1].model !== 'google/gemini-3.8-flash') {
    throw new AIModelError('Cadeia de IA inválida.', 'request_configuration_error', false, 'global');
  }

  const attempts: AIAttemptRecord[] = [];
  const sleep = options.sleep || ((milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds)));
  let lastError: AIModelError | undefined;
  for (const [targetIndex, target] of options.targets.entries()) {
    if (options.signal?.aborted) throw new AIModelError('Análise interrompida.', 'cancelled', false, 'global');
    await options.onTargetStart?.(target);
    const deadline = target.timeoutMs ? Date.now() + target.timeoutMs : Infinity;
    for (let attempt = 1; attempt <= target.maxAttempts; attempt++) {
      if (options.signal?.aborted) throw new AIModelError('Análise interrompida.', 'cancelled', false, 'global');
      const startedAt = Date.now();
      const startedAtIso = new Date(startedAt).toISOString();
      const controller = new AbortController();
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        lastError = new AIModelError('Tempo limite do modelo excedido.', 'timeout', true);
        break;
      }
      const timer = Number.isFinite(remaining) ? setTimeout(() => controller.abort(), remaining) : undefined;
      const onCancel = () => controller.abort();
      options.signal?.addEventListener('abort', onCancel, { once: true });
      try {
        const execution = options.execute(target, attempt, controller.signal);
        const result = await Promise.race([
          execution,
          new Promise<never>((_resolve, reject) => {
            if (controller.signal.aborted) reject(new AIModelError('Tempo limite ou interrupção.', 'timeout', true));
            else controller.signal.addEventListener('abort', () => reject(new AIModelError('Tempo limite ou interrupção.', 'timeout', true)), { once: true });
          }),
        ]);
        if (options.signal?.aborted) throw new AIModelError('Análise interrompida.', 'cancelled', false, 'global');
        if (controller.signal.aborted) throw new AIModelError('Resposta recebida após o timeout.', 'timeout', true);
        const record: AIAttemptRecord = {
          provider: target.provider,
          model: result.actualModel || target.model,
          attempt,
          status: 'success',
          httpStatus: 200,
          durationMs: Date.now() - startedAt,
          startedAt: startedAtIso,
          finishedAt: new Date().toISOString(),
          routedProvider: result.routedProvider,
          routerAttempt: result.routerAttempt,
          requestId: result.requestId,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          cost: result.cost,
        };
        attempts.push(record);
        options.onAttempt?.(record);
        return {
          value: result.value,
          provider: target.provider,
          model: result.actualModel || target.model,
          attempts,
          fallbackUsed: targetIndex > 0,
          routedProvider: result.routedProvider,
          routerAttempt: result.routerAttempt,
        };
      } catch (error) {
        const normalized = options.signal?.aborted
          ? new AIModelError('Análise interrompida.', 'cancelled', false, 'global')
          : normalizeAIError(error);
        lastError = normalized;
        if (normalized.reason === 'cancelled') throw normalized;
        const shouldRetry = normalized.retryable && attempt < target.maxAttempts && Date.now() < deadline;
        const record: AIAttemptRecord = {
          provider: target.provider,
          model: target.model,
          attempt,
          status: 'failed',
          reason: normalized.reason,
          message: normalized.message,
          httpStatus: normalized.httpStatus,
          durationMs: Date.now() - startedAt,
          startedAt: startedAtIso,
          finishedAt: new Date().toISOString(),
        };
        attempts.push(record);
        options.onAttempt?.(record);
        if (!shouldRetry) break;
        await sleep(Math.min(500 * 2 ** (attempt - 1), 4000, Math.max(0, deadline - Date.now())));
        if (options.signal?.aborted) throw new AIModelError('Análise interrompida.', 'cancelled', false, 'global');
      } finally {
        if (timer) clearTimeout(timer);
        options.signal?.removeEventListener('abort', onCancel);
      }
    }
    if (lastError?.scope === 'global' || lastError?.scope === 'provider') break;
  }

  throw Object.assign(
    lastError || new AIModelError('Todas as tentativas com OpenRouter falharam.', 'unknown_error', true),
    { attempts },
  );
}
