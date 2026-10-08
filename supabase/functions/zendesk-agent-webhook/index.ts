import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { secretApiKey } from '../_shared/keys.ts';
import { parseZendeskDemotionEvent, verifyZendeskSignature } from './verification.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

async function readLimitedBody(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(body);
}

serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const secret = Deno.env.get('ZENDESK_AGENT_WEBHOOK_SIGNING_SECRET');
  const subdomain = Deno.env.get('ZENDESK_SUBDOMAIN');
  const email = Deno.env.get('ZENDESK_EMAIL');
  const token = Deno.env.get('ZENDESK_API_TOKEN');
  if (!secret || !subdomain || !email || !token) return json({ error: 'Integração indisponível.' }, 503);
  const raw = await readLimitedBody(request, 32_768);
  if (raw === null) return json({ error: 'Payload muito grande.' }, 413);
  if (!await verifyZendeskSignature(secret,
    request.headers.get('x-zendesk-webhook-signature'),
    request.headers.get('x-zendesk-webhook-signature-timestamp'), raw)) {
    return json({ error: 'Assinatura inválida.' }, 401);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return json({ error: 'JSON inválido.' }, 400); }
  const demotion = parseZendeskDemotionEvent(parsed);
  if (!demotion) return json({ ignored: true });

  try {
    // The event is only a signal. Confirm the current role with Zendesk before
    // changing QWP access; delayed or forged old events cannot demote an agent.
    const response = await fetch(`https://${subdomain}.zendesk.com/api/v2/users/${demotion.userId}.json`, {
      headers: { Authorization: `Basic ${btoa(`${email}/token:${token}`)}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Zendesk returned ${response.status}`);
    const payload = await response.json();
    if (String(payload?.user?.id) !== demotion.userId || payload?.user?.role !== 'end-user') {
      return json({ ignored: true, reason: 'Zendesk role no longer matches the event' });
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretApiKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc('deactivate_zendesk_agent', {
      p_event_id: demotion.eventId, p_external_id: demotion.userId,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : null;
    console.info('[zendesk-agent-webhook] Event processed', {
      eventId: demotion.eventId, deactivated: Boolean(result?.deactivated),
      revokedSessions: Number(result?.revoked_sessions || 0),
    });
    return json({ success: true });
  } catch (error) {
    console.error('[zendesk-agent-webhook] Processing failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Falha temporária ao processar evento.' }, 503);
  }
});
