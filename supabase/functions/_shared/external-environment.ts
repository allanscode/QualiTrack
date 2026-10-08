// Only this Supabase project may perform automatic work or mutate Zendesk.
// Keep the check tied to the server-provided project URL, never to a client flag.
const PRODUCTION_PROJECT_REF = 'vpytvgpsqdapgouyjowc';

export function isProductionProject(supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false;
  try {
    return new URL(supabaseUrl).hostname === `${PRODUCTION_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

export function guardedExternalFetch(fetcher: typeof fetch, supabaseUrl: string | undefined): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input));
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    if (!isProductionProject(supabaseUrl)
      && (url.hostname === 'zendesk.com' || url.hostname.endsWith('.zendesk.com'))
      && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      throw new Error('Simulação do staging: alteração no Zendesk bloqueada.');
    }
    return fetcher(input, init);
  }) as typeof fetch;
}
