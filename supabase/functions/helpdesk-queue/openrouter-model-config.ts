import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { OPENROUTER_MODEL } from './openrouter-client.ts';

export interface CatalogModel {
  id: string;
  name: string;
  pricing: { prompt?: string; completion?: string; request?: string } | null;
  architecture: { input_modalities?: string[]; output_modalities?: string[] } | null;
}

export function textModels(data: unknown): CatalogModel[] {
  if (!data || typeof data !== 'object' || !('data' in data) || !Array.isArray(data.data))
    throw new Error('Catálogo OpenRouter inválido.');
  return data.data.filter((item: unknown): item is CatalogModel => {
    if (!item || typeof item !== 'object') return false;
    const model = item as Partial<CatalogModel>;
    return typeof model.id === 'string' && /^[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._:-]+$/.test(model.id)
      && typeof model.name === 'string'
      && Array.isArray(model.architecture?.input_modalities)
      && model.architecture.input_modalities.includes('text')
      && Array.isArray(model.architecture?.output_modalities)
      && model.architecture.output_modalities.length === 1
      && model.architecture.output_modalities[0] === 'text';
  });
}

export function isFreeModel(model: CatalogModel): boolean {
  const prompt = model.pricing?.prompt;
  const completion = model.pricing?.completion;
  return prompt !== undefined && completion !== undefined && prompt !== '' && completion !== ''
    && Number.isFinite(Number(prompt)) && Number.isFinite(Number(completion))
    && Number(prompt) === 0 && Number(completion) === 0
    && (model.pricing?.request === undefined || Number(model.pricing.request) === 0);
}

export async function fetchTextModels(apiKey: string, fetcher: typeof fetch = fetch): Promise<CatalogModel[]> {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY não configurada.');
  const response = await fetcher('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Catálogo OpenRouter indisponível (HTTP ${response.status}).`);
  return textModels(await response.json());
}

export async function configuredModel(
  db: SupabaseClient,
): Promise<{ modelId: string; isFree: boolean }> {
  const { data, error } = await db.from('ai_model_config').select('model_id,is_free').eq('id', 'default').maybeSingle();
  if (error) throw new Error('Configuração do modelo indisponível.');
  return { modelId: data?.model_id || OPENROUTER_MODEL, isFree: data?.is_free === true };
}
