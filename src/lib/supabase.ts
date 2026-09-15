import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { UserPreferences } from '../types';
import { getMockData, setMockData } from './mockDb';
export { mockDb, resolveMockUserEmail, findMockUserById } from './mockDb';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

// Capture initial URL parameters before Supabase client processes them (PKCE flow)
export const initialUrlHash = typeof window !== 'undefined' ? window.location.hash : '';
export const initialUrlSearch = typeof window !== 'undefined' ? window.location.search : '';

const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  if (import.meta.env.DEV) console.log(`[Supabase Fetch ${requestId}] START`, options?.method || 'GET');

  try {
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;
    if (import.meta.env.DEV) console.log(`[Supabase Fetch ${requestId}] END (${duration}ms) - Status: ${response.status}`);
    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Supabase Fetch ${requestId}] ERROR (${duration}ms) -`, error);
    throw error;
  }
};

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'))
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => await fn(),
      },
      realtime: {
        worker: true
      },
      global: {
        fetch: customFetch
      }
    })
  : null;

// Helper to assert supabase is not null (use only after checking isMockMode)
export function assertSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase client not initialized. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

/**
 * Devolve o access_token da sessão atual, ou falha com mensagem clara.
 *
 * Sem sessão ativa, supabase-js monta o cabeçalho das Edge Functions como
 *   Authorization: `Bearer ${session?.access_token ?? supabaseKey}`
 * e acaba enviando a chave publicável no lugar do token do usuário. A função
 * recebe um Authorization aparentemente válido, mas getUser() falha com
 * "AuthSessionMissingError: Auth session missing!" e responde 401 — que o
 * supabase-js reporta como o genérico "Edge Function returned a non-2xx
 * status code", sem indicar que o problema era a sessão.
 *
 * Falhar aqui torna o diagnóstico imediato e evita mandar a chave publicável
 * como se fosse credencial de usuário.
 */
export async function requireAccessToken(): Promise<string> {
  const sb = assertSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sua sessão expirou. Saia e entre novamente para continuar.');
  }
  return session.access_token;
}

// Type guard for mock mode
export const isMockMode = !supabase;

export async function upsertUserPreferences(userId: string, partial: Record<string, unknown>): Promise<void> {
  if (!supabase) {
    const rows = getMockData<{ user_id: string; preferences: UserPreferences; updated_at: string }>('user_preferences');
    const existing = rows.find((r) => r.user_id === userId);
    if (existing) {
      existing.preferences = { ...(existing.preferences || {}), ...partial };
      existing.updated_at = new Date().toISOString();
      setMockData('user_preferences', rows);
    } else {
      rows.push({
        user_id: userId,
        preferences: { ...partial },
        updated_at: new Date().toISOString()
      });
      setMockData('user_preferences', rows);
    }
  } else {
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', userId)
      .single();
    const merged = { ...(existing?.preferences || {}), ...partial };
    await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, preferences: merged }, { onConflict: 'user_id' });
  }
}
