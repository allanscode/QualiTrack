import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { secretApiKey } from '../_shared/keys.ts';

/**
 * Edge Function: helpdesk-webhook
 * Receptor oficial e seguro para eventos orientados a webhook do Zendesk (Opção B).
 * 
 * SEGURANÇA:
 * Exige cabeçalho de autenticação compartilhado:
 * - Header `x-qualitrack-webhook-token` OU `Authorization: Bearer <token>`
 * - Comparado estritamente com `HELPDESK_WEBHOOK_SECRET` nos Secrets do Supabase.
 * - Requisições sem o token ou com token inválido recebem HTTP 401 Unauthorized imediato.
 */

const WebhookPayloadSchema = z.object({
  event: z.enum(['csat_bad', 'child_ticket_created', 'ticket_updated', 'ping']).default('ticket_updated'),
  ticket_id: z.union([z.string().max(30), z.number()]).transform(v => String(v)),
  subject: z.string().max(1000).optional(),
  requester_name: z.string().max(250).optional(),
  assignee_name: z.string().max(250).optional(),
  assignee_email: z.string().max(254).optional(),
  group_name: z.string().max(250).optional(),
  csat_status: z.enum(['bad', 'good', 'offered', 'unrated']).optional(),
  csat_comment: z.string().max(12000).optional(),
  parent_ticket_id: z.union([z.string().max(30), z.number()]).optional().transform(v => (v && String(v).trim()) ? String(v).trim() : undefined),
  macro_type: z.string().max(250).optional(),
  tags: z.union([z.array(z.string().max(250)).max(150), z.string().max(16000).transform(s => s.split(/\s+/).filter(Boolean))]).optional(),
  ticket_fields: z.array(z.object({
    title: z.string().max(250),
    value: z.string().max(10000),
  })).max(150).optional(),
  timestamp: z.string().max(80).optional(),
});

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

async function readLimitedBody(req: Request, limit: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

serve(async (req: Request) => {
  // Server-to-server endpoint; browsers have no reason to invoke this webhook.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido. Utilize POST.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1. VALIDAÇÃO RIGOROSA DE AUTENTICAÇÃO DO WEBHOOK
  const expectedSecret = Deno.env.get('HELPDESK_WEBHOOK_SECRET');
  if (!expectedSecret) {
    console.error('[helpdesk-webhook] Erro de configuração: HELPDESK_WEBHOOK_SECRET não definido no Supabase Secrets');
    return new Response(JSON.stringify({ error: 'Configuração de autenticação pendente no servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const customHeaderToken = req.headers.get('x-qualitrack-webhook-token');
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const bearerToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;

  const clientToken = customHeaderToken?.trim() || bearerToken;

  if (!clientToken || !timingSafeEqual(clientToken, expectedSecret)) {
    console.warn('[helpdesk-webhook] Tentativa não autorizada rejeitada (token ausente ou inválido)');
    return new Response(JSON.stringify({
      error: 'Unauthorized: Webhook token inválido ou ausente. Forneça o header x-qualitrack-webhook-token correto.',
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. PARSE E PROCESSAMENTO DO PAYLOAD
  try {
    const maxBodyBytes = 262_144;
    if (Number(req.headers.get('content-length') || 0) > maxBodyBytes) {
      return new Response(JSON.stringify({ error: 'Payload muito grande' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
    }
    const rawText = await readLimitedBody(req, maxBodyBytes);
    if (rawText === null) {
      return new Response(JSON.stringify({ error: 'Payload muito grande' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
    }
    const rawBody = (() => { try { return JSON.parse(rawText); } catch { return null; } })();
    if (!rawBody) {
      return new Response(JSON.stringify({ error: 'Payload JSON inválido ou vazio' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Resposta rápida para testes de conectividade do Zendesk (botão "Testar webhook" no Admin Center)
    if (rawBody.test !== undefined || !rawBody.ticket_id || rawBody.event === 'ping') {
      return new Response(JSON.stringify({
        success: true,
        message: 'QualiTrack Webhook endpoint ativo e autenticado com sucesso.',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const parseResult = WebhookPayloadSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return new Response(JSON.stringify({
        error: 'Schema do payload inválido',
        details: parseResult.error.format(),
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = parseResult.data;
    if (!/^\d+$/.test(payload.ticket_id)) {
      return new Response(JSON.stringify({ error: 'ticket_id deve ser numérico' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = secretApiKey();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Registra log para auditoria de administradores
    try {
      const { error: logError } = await supabase.from('ai_evaluation_logs').insert({
        ticket_id: payload.ticket_id,
        ticket_subject: `Webhook Event: ${payload.event}`,
        evaluation_type: payload.event === 'child_ticket_created' ? 'chamado_filho' : 'atendimento',
        provider: 'zendesk_webhook',
        model: 'webhook-trigger',
        response_json: { event: payload.event, ticket_id: payload.ticket_id },
        status: 'success',
      });
      if (logError) console.warn('[helpdesk-webhook] Falha ao registrar metadados do evento.');
    } catch {
      console.warn('[helpdesk-webhook] Falha ao registrar metadados do evento.');
    }

    if (payload.event === 'child_ticket_created') {
      const subdomain = Deno.env.get('ZENDESK_SUBDOMAIN');
      const email = Deno.env.get('ZENDESK_EMAIL');
      const apiToken = Deno.env.get('ZENDESK_API_TOKEN');
      if (!subdomain || !email || !apiToken) {
        return new Response(JSON.stringify({ error: 'Integração Zendesk não configurada' }), { status: 503 });
      }

      const ticketResponse = await fetch(
        `https://${subdomain}.zendesk.com/api/v2/tickets/${payload.ticket_id}.json`,
        {
          headers: { Authorization: `Basic ${btoa(`${email}/token:${apiToken}`)}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!ticketResponse.ok) {
        console.error('[helpdesk-webhook] Falha ao confirmar chamado filho no Zendesk.');
        return new Response(JSON.stringify({ error: 'Falha ao confirmar ticket no Zendesk' }), { status: 503 });
      }
      const { ticket } = await ticketResponse.json();
      if (String(ticket?.id) !== payload.ticket_id || ['closed', 'archived'].includes(ticket?.status)) {
        return new Response(JSON.stringify({ success: true, ignored: true }), { status: 200 });
      }
      const { data: existingMonitoria, error: monitoriaError } = await supabase.from('monitorias')
        .select('id').eq('ticket_id', payload.ticket_id).limit(1);
      if (monitoriaError) {
        return new Response(JSON.stringify({ error: 'Falha ao verificar monitoria' }), { status: 503 });
      }
      if (existingMonitoria?.length) {
        return new Response(JSON.stringify({ success: true, ignored: true }), { status: 200 });
      }

      // O evento assinado pelo Zendesk confirma o ticket. Registrar no catálogo
      // permite distribuir no instante do evento; a leitura da fila completa o snapshot.
      const { error: catalogError } = await supabase.from('queue_ticket_catalog').upsert({
        ticket_id: payload.ticket_id,
        queue_type: 'filhos',
        verified_at: new Date().toISOString(),
      }, { onConflict: 'ticket_id,queue_type' });
      if (catalogError) {
        console.error('[helpdesk-webhook] Falha ao registrar ticket no catálogo.');
        return new Response(JSON.stringify({ error: 'Falha ao preparar distribuição' }), { status: 503 });
      }
      const { error: assignmentError } = await supabase.rpc('assign_queue_tickets', {
        p_tickets: [{ ticket_id: payload.ticket_id, queue_type: 'filhos' }],
      });
      if (assignmentError) {
        console.error('[helpdesk-webhook] Falha ao distribuir chamado filho.');
        return new Response(JSON.stringify({ error: 'Falha ao distribuir chamado filho' }), { status: 503 });
      }
    }

    if (payload.event === 'csat_bad' || payload.event === 'child_ticket_created') {
      const occurredAt = payload.timestamp && !Number.isNaN(Date.parse(payload.timestamp))
        ? new Date(payload.timestamp).toISOString()
        : new Date().toISOString();
      const eventKey = `${payload.event}:${payload.ticket_id}:${payload.timestamp ? occurredAt : occurredAt.slice(0, 16)}`;
      const { error } = await supabase.from('queue_event_notifications').upsert({
        event_key: eventKey,
        event_type: payload.event,
        ticket_id: payload.ticket_id,
        occurred_at: occurredAt,
      }, { onConflict: 'event_key', ignoreDuplicates: true });
      if (error) {
        console.error('[helpdesk-webhook] Falha ao registrar notificação de fila.');
        return new Response(JSON.stringify({ error: 'Falha ao registrar o evento de fila' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Evento '${payload.event}' do ticket #${payload.ticket_id} recebido e autenticado com sucesso.`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch {
    console.error('[helpdesk-webhook] Erro interno ao processar evento.');
    return new Response(JSON.stringify({
      error: 'Erro interno ao processar webhook',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
