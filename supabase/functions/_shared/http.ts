export function configuredOrigin(value: string | undefined): string {
  if (!value) throw new Error('FRONTEND_URL não configurada');
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('FRONTEND_URL deve usar HTTPS');
  return url.origin;
}
export function corsFor(frontendUrl: string | undefined): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': configuredOrigin(frontendUrl),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin', 'Cache-Control': 'no-store',
  };
}
export function rejectRequest(req: Request, headers: Record<string, string>): Response | null {
  const origin = req.headers.get('Origin');
  if (origin && origin !== headers['Access-Control-Allow-Origin']) return new Response(JSON.stringify({ error: 'Origem não permitida' }), { status: 403 });
  if (req.method !== 'POST' && req.method !== 'OPTIONS') return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405, headers: { ...headers, Allow: 'POST, OPTIONS' } });
  return null;
}
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
