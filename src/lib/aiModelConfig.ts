import { supabase } from './supabase';
import { getMockData, setMockData } from './mockDb';
import { extractFunctionErrorMessage } from './helpdeskQueue';

export interface OpenRouterModelOption {
  id: string;
  name: string;
  pricing: { prompt?: string; completion?: string; request?: string } | null;
  free: boolean;
}

export const DEFAULT_AI_MODEL = 'z-ai/glm-5.3-flash';
const MOCK_KEY = 'ai_model_config';

async function invoke<T>(action: string, model_id?: string): Promise<T> {
  if (!supabase) throw new Error('Supabase indisponível.');
  const { data, error } = await supabase.functions.invoke('helpdesk-queue', { body: { action, model_id } });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Configuração de IA indisponível.'));
  return data as T;
}

export async function getAIModelConfig(): Promise<string> {
  if (!supabase) return getMockData<string>(MOCK_KEY)[0] || DEFAULT_AI_MODEL;
  const { data, error } = await supabase.from('ai_model_config').select('model_id').eq('id', 'default').maybeSingle();
  if (error) throw new Error('Não foi possível carregar o modelo salvo.');
  return data?.model_id || DEFAULT_AI_MODEL;
}

export async function listOpenRouterModels(): Promise<OpenRouterModelOption[]> {
  if (!supabase) return [
    { id: DEFAULT_AI_MODEL, name: 'GLM 5.3 Flash (mock)', pricing: null, free: false },
    { id: 'openrouter/free', name: 'Free router (mock)', pricing: { prompt: '0', completion: '0' }, free: true },
    { id: 'google/gemma-4-31b-it', name: 'Gemma 4 31B (mock)', pricing: null, free: false },
    { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash (mock)', pricing: null, free: false },
    ...[
      'z-ai/glm-5.3-flash:free', 'google/gemma-4-31b-it:free',
      'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3.5-lightning:free',
      'poolside/laguna-s-2.1:free', 'minimax/minimax-m3.1-flash:free',
      'deepseek/deepseek-v4-flash-0731:free', 'xingchen-agi/xing4.0-29b-a4b:free',
      'nvidia/nemotron-3-nano-30b-a3b:free',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    ].map(id => ({ id, name: `${id} (mock)`, pricing: { prompt: '0', completion: '0' }, free: true })),
  ];
  return (await invoke<{ models: OpenRouterModelOption[] }>('list_ai_models')).models;
}

export async function setAIModelConfig(modelId: string): Promise<void> {
  if (!supabase) { setMockData(MOCK_KEY, [modelId]); return; }
  await invoke('set_ai_model_config', modelId);
}
