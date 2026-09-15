import { publicApiKey, secretApiKey } from '../_shared/keys.ts';
import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { corsFor, rejectRequest, escapeHtml } from '../_shared/http.ts';

const runtime = Deno as unknown as { writeAll?: (w: { write(b: Uint8Array): Promise<number> }, b: Uint8Array) => Promise<void> };
runtime.writeAll ??= async (writer, bytes) => {
  let offset = 0;
  while (offset < bytes.length) {
    const written = await writer.write(bytes.subarray(offset));
    if (written <= 0) throw new Error('SMTP write failed');
    offset += written;
  }
};
const headers = { ...corsFor(Deno.env.get('FRONTEND_URL')), 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

serve(async req => {
  const rejected = rejectRequest(req, headers);
  if (rejected) return rejected;
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return json({ success: false, error: 'Sessão necessária' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, secretApiKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return json({ success: false, error: 'Sessão inválida' }, 401);
  const { data: caller } = await db.from('users').select('role,active').eq('id', user.id).maybeSingle();
  if (!caller?.active || !['admin', 'gestor_qualidade'].includes(caller.role)) return json({ success: false, error: 'Acesso negado' }, 403);
  const body = await req.json().catch(() => null);
  // Invites/resets belong to Supabase Auth. Never accept arbitrary recipients/HTML.
  if (body?.type !== 'rejection' || typeof body.request_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.request_id)) return json({ success: false, error: 'Solicitação inválida' }, 400);
  const { data: request, error: requestError } = await db.from('access_requests')
    .select('id,email,name,rejection_reason,status').eq('id', body.request_id).maybeSingle();
  if (requestError || !request || request.status !== 'rejected') return json({ success: false, error: 'Solicitação indisponível' }, 400);
  const callerLimit = await db.rpc('consume_security_rate_limit', { bucket_key: `mailer:${user.id}`, max_requests: 20, window_seconds: 900 });
  if (callerLimit.error) return json({ success: false, error: 'Serviço indisponível' }, 503);
  if (!callerLimit.data) return json({ success: false, error: 'Limite de envio atingido' }, 429);
  const { data: allowed, error: limitError } = await db.rpc('consume_security_rate_limit', {
    bucket_key: `rejection:${request.id}`, max_requests: 1, window_seconds: 300,
  });
  if (limitError) return json({ success: false, error: 'Serviço indisponível' }, 503);
  if (!allowed) return json({ success: false, error: 'Aguarde antes de reenviar' }, 429);
  const client = new SmtpClient();
  try {
    const username = Deno.env.get('SMTP_USERNAME');
    const password = Deno.env.get('SMTP_PASSWORD');
    if (!username || !password) throw new Error('SMTP not configured');
    await client.connectTLS({ hostname: Deno.env.get('SMTP_HOSTNAME') || 'smtp.gmail.com', port: Number(Deno.env.get('SMTP_PORT') || '465'), username, password });
    const name = escapeHtml(request.name);
    const reason = escapeHtml(request.rejection_reason || 'Não informado.');
    await client.send({ from: username, to: request.email, subject: 'QualidadeWP - Solicitação de acesso',
      content: `Olá, ${request.name}. Sua solicitação foi recusada. Motivo: ${request.rejection_reason || 'Não informado.'}`,
      html: `<p>Olá, ${name}.</p><p>Sua solicitação de acesso foi recusada.</p><p>${reason}</p><p>Em caso de dúvidas, contate o administrador.</p>`,
    });
    return json({ success: true });
  } catch {
    console.error('send-email: falha no envio SMTP');
    return json({ success: false, error: 'Não foi possível enviar a notificação. Contate o administrador.' }, 503);
  } finally {
    try { await client.close(); } catch { /* connection may not have opened */ }
  }
});
