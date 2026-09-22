import { AIModelError, httpAIError, normalizeAIError } from './ai-fallback.ts';

export const OPENROUTER_MODEL = 'z-ai/glm-5.3-flash';
export const OPENROUTER_FALLBACK_MODEL = 'google/gemini-3.8-flash';

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
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<{ text: string; routedProvider?: string; routerAttempt?: number; requestId?: string; promptTokens?: number; completionTokens?: number; cost?: number }> {
  const { prompt, responseSchema, apiKey, model = OPENROUTER_MODEL, signal, fetcher = fetch } = options;
  if (!apiKey) throw new AIModelError('OPENROUTER_API_KEY não configurada.', 'credentials_error', false, 'provider');
  if (model !== OPENROUTER_MODEL && model !== OPENROUTER_FALLBACK_MODEL)
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
      messages: [{ role: 'user', content: prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'wp_quality_evaluation', strict: true, schema: responseSchema },
      },
      provider: { allow_fallbacks: true, require_parameters: true },
    }),
    signal: signal || AbortSignal.timeout(30000),
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
  if (data.model !== model) {
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
