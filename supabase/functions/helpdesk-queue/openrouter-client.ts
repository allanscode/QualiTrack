import { AIModelError, httpAIError, normalizeAIError } from './ai-fallback.ts';

// Somente modelos gratuitos (sufixo :free). Gemma é o primário; os demais são
// fallbacks ordenados do mais inteligente ao menos.
export const OPENROUTER_MODEL = 'google/gemma-4-31b-it:free';
export const OPENROUTER_FALLBACK_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-26b-a4b-it:free',
] as const;
export const OPENROUTER_FALLBACK_MODEL = OPENROUTER_FALLBACK_MODELS[0];
export const OPENROUTER_ALLOWED_MODELS: readonly string[] = [OPENROUTER_MODEL, ...OPENROUTER_FALLBACK_MODELS];
// Guarda contra requisição pendurada: só estoura se a IA realmente não retornar.
export const OPENROUTER_HANG_GUARD_MS = 120_000;

interface OpenRouterResponse {
  id?: string;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  openrouter_metadata?: {
    attempt?: number;
    endpoints?: { available?: Array<{ provider?: string; selected?: boolean }> };
  };
}

export async function callOpenRouter(options: {
  prompt: string;
  responseSchema: unknown;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<{ text: string; routedProvider?: string; routerAttempt?: number; requestId?: string; promptTokens?: number; completionTokens?: number; cost?: number }> {
  const { prompt, responseSchema, apiKey, model = OPENROUTER_MODEL, maxTokens, signal, fetcher = fetch } = options;
  if (!apiKey) throw new AIModelError('OPENROUTER_API_KEY não configurada.', 'credentials_error', false, 'provider');
  if (!OPENROUTER_ALLOWED_MODELS.includes(model))
    throw new AIModelError('Modelo não permitido.', 'request_configuration_error', false, 'global');

  const response = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-OpenRouter-Metadata': 'enabled',
      'HTTP-Referer': 'https://qualitrack.app',
      'X-OpenRouter-Title': 'WP Qualidade',
    },
    body: JSON.stringify({
      model,
      // Modelos gratuitos nem sempre suportam json_schema: o schema vai no prompt
      // e parseModelJSON/validate* garantem o formato na resposta.
      messages: [{
        role: 'user',
        content: `${prompt}

Responda SOMENTE com um objeto JSON válido (sem markdown, sem texto extra) que siga exatamente este JSON Schema:
${JSON.stringify(responseSchema)}`,
      }],
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      provider: { allow_fallbacks: true },
    }),
    signal: signal || AbortSignal.timeout(OPENROUTER_HANG_GUARD_MS),
  });
  if (!response.ok) throw await httpAIError('openrouter', model, response);

  let data: OpenRouterResponse;
  try {
    data = await response.json() as OpenRouterResponse;
  } catch (error) {
    const normalized = normalizeAIError(error);
    if (normalized.reason === 'timeout' || normalized.reason === 'network_error') throw normalized;
    throw new AIModelError('OpenRouter retornou um envelope JSON inválido.', 'response_parse_error', true);
  }
  if (!data.model) throw new AIModelError('OpenRouter não confirmou o modelo esperado.', 'incomplete_response', true);
  if (data.model.replace(/:free$/, '') !== model.replace(/:free$/, '')) {
    throw new AIModelError('OpenRouter retornou outro modelo.', 'request_configuration_error', false, 'global');
  }
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content)
    ? content.map(part => part.text || '').join('') : '';
  if (!text.trim()) throw new AIModelError('OpenRouter retornou resposta vazia.', 'empty_response', true);
  const routedProvider = data.openrouter_metadata?.endpoints?.available?.find(endpoint => endpoint.selected)?.provider;
  const routerAttempt = data.openrouter_metadata?.attempt;
  return {
    text, routedProvider, routerAttempt,
    requestId: response.headers.get('x-generation-id') || data.id,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
    cost: data.usage?.cost,
  };
}
