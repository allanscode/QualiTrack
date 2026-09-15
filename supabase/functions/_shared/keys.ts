// New projects may expose named keys instead of legacy JWT-based API keys.
export function resolveApiKey(legacy: string | undefined, namedKeys: string | undefined): string {
  if (namedKeys) {
    let keys: Record<string, unknown>;
    try { keys = JSON.parse(namedKeys) as Record<string, unknown>; }
    catch { throw new Error('Mapa de chaves Supabase inválido'); }
    if (!keys || typeof keys !== 'object') throw new Error('Mapa de chaves Supabase inválido');
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  }
  if (legacy) return legacy;
  throw new Error('Chave Supabase do servidor não configurada');
}
export const publicApiKey = () => resolveApiKey(Deno.env.get('SUPABASE_ANON_KEY'), Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'));
export const secretApiKey = () => resolveApiKey(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('SUPABASE_SECRET_KEYS'));
