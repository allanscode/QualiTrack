import { publicApiKey, secretApiKey } from '../_shared/keys.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { corsFor, rejectRequest, configuredOrigin } from '../_shared/http.ts';
const headers = { ...corsFor(Deno.env.get('FRONTEND_URL')), 'Content-Type': 'application/json' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const accepted = () => reply({ success: true, message: 'Se aplicável, a solicitação será processada.' });

serve(async req => {
  const rejected = rejectRequest(req, headers);
  if (rejected) return rejected;
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const text = await req.text();
  if (text.length > 8192) return reply({ error: 'Solicitação inválida' }, 400);
  let body;
  try { body = JSON.parse(text); } catch { return reply({ error: 'Solicitação inválida' }, 400); }
  if (!body || !['request-access','recover'].includes(body.action) || typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return reply({ error: 'Solicitação inválida' }, 400);
  if (body.action === 'request-access' && (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 120)) return reply({ error: 'Nome inválido' }, 400);
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) return reply({ error: 'Verificação de segurança não configurada' }, 503);
  try {
    if (body.action === 'recover') {
      // Auth validates the single-use CAPTCHA itself (do not consume it twice).
      const auth = createClient(Deno.env.get('SUPABASE_URL')!, publicApiKey(), { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await auth.auth.resetPasswordForEmail(body.email.trim().toLowerCase(), {
        redirectTo: configuredOrigin(Deno.env.get('FRONTEND_URL')),
        captchaToken: typeof body.captchaToken === 'string' ? body.captchaToken : '',
      });
      if (error) console.error('public-access: recovery delivery failed');
      return accepted();
    }
    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret, response: typeof body.captchaToken === 'string' ? body.captchaToken : '' }),
    });
    const result = await verification.json();
    if (!result.success || result.hostname !== new URL(configuredOrigin(Deno.env.get('FRONTEND_URL'))).hostname) return reply({ error: 'Confirme a verificação de segurança novamente' }, 400);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, secretApiKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: globalAllowed, error: globalError } = await db.rpc('consume_security_rate_limit', { bucket_key: 'request-access:global', max_requests: 100, window_seconds: 900 });
    if (globalError) return reply({ error: 'Serviço indisponível' }, 503);
    if (!globalAllowed) return accepted();
    const email = body.email.trim().toLowerCase();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    const { data: allowed, error: limitError } = await db.rpc('consume_security_rate_limit', { bucket_key: `${body.action}:${hash}`, max_requests: 3, window_seconds: 900 });
    if (limitError) return reply({ error: 'Serviço indisponível' }, 503);
    if (!allowed) return accepted();
    {
      const { data: existing, error: lookupError } = await db.from('users').select('id').eq('email', email).maybeSingle();
      const { data: pending, error: pendingError } = await db.from('access_requests').select('id').eq('email', email).eq('status','pending').limit(1);
      if (lookupError || pendingError) return reply({ error: 'Serviço indisponível' }, 503);
      if (!existing && !pending?.length) {
        const { error } = await db.from('access_requests').insert({ name: body.name.trim(), email, status: 'pending' });
        if (error) console.error('public-access: request insert failed');
      }
    }
    return accepted();
  } catch {
    return reply({ error: 'Serviço indisponível' }, 503);
  }
});
