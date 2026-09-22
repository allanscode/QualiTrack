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
  ticket_id: z.union([z.string(), z.number()]).transform(v => String(v)),
  subject: z.string().optional(),
  requester_name: z.string().optional(),
  assignee_name: z.string().optional(),
  assignee_email: z.string().optional(),
  group_name: z.string().optional(),
  csat_status: z.enum(['bad', 'good', 'offered', 'unrated']).optional(),
  csat_comment: z.string().optional(),
  parent_ticket_id: z.union([z.string(), z.number()]).optional().transform(v => (v && String(v).trim()) ? String(v).trim() : undefined),
  macro_type: z.string().optional(),
  tags: z.union([z.array(z.string()), z.string().transform(s => s.split(/\s+/).filter(Boolean))]).optional(),
  ticket_fields: z.array(z.object({
    title: z.string(),
    value: z.string(),
  })).optional(),
  timestamp: z.string().optional(),
});

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-qualitrack-webhook-token',
      },
    });
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

  if (!clientToken || clientToken !== expectedSecret) {
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
    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return new Response(JSON.stringify({ error: 'Payload JSON inválido ou vazio' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (rawBody.event === 'check_zendesk_triggers') {
      const subdomain = Deno.env.get('ZENDESK_SUBDOMAIN');
      const email = Deno.env.get('ZENDESK_EMAIL');
      const apiToken = Deno.env.get('ZENDESK_API_TOKEN');

      if (!subdomain || !email || !apiToken) {
        return new Response(JSON.stringify({ error: 'Credenciais do Zendesk ausentes nos secrets' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const zendeskAuth = btoa(`${email}/token:${apiToken}`);
      const zHeaders = {
        Authorization: `Basic ${zendeskAuth}`,
        'Content-Type': 'application/json',
      };

      const resp = await fetch(`https://${subdomain}.zendesk.com/api/v2/triggers.json?active=true`, { headers: zHeaders });
      if (!resp.ok) {
        return new Response(JSON.stringify({ error: `Zendesk API erro: ${resp.status}` }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const data = await resp.json();
      const triggers = (data.triggers || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        active: t.active,
        actions: t.actions,
        conditions: t.conditions,
      }));

      return new Response(JSON.stringify({
        success: true,
        subdomain,
        total_triggers: triggers.length,
        triggers,
      }), {
        status: 200,
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
