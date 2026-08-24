import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RequestSchema = z.object({
  action: z.enum(['fetch_queue', 'fetch_dialogue', 'evaluate_ai']),
  queue_type: z.enum(['negativas', 'proativas', 'positivas']).optional(),
  ticket_id: z.string().optional(),
  form_criteria: z.any().optional(),
});

function jsonResponse(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Token de autenticação não fornecido' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Valida o usuário autenticado
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: 'Sessão inválida ou expirada' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return jsonResponse({ error: 'Payload inválido', details: parseResult.error.flatten() }, 400);
    }

    const { action, queue_type, ticket_id } = parseResult.data;

    const subdomain = Deno.env.get('ZENDESK_SUBDOMAIN');
    const email = Deno.env.get('ZENDESK_EMAIL');
    const apiToken = Deno.env.get('ZENDESK_API_TOKEN');

    if (!subdomain || !email || !apiToken) {
      return jsonResponse({
        error: 'Credenciais do Zendesk não configuradas no Supabase Secrets'
      }, 500);
    }

    const zendeskAuth = btoa(`${email}/token:${apiToken}`);
    const zendeskHeaders = {
      Authorization: `Basic ${zendeskAuth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // 1. Busca de Fila de Chamados
    if (action === 'fetch_queue') {
      let searchQuery = 'type:ticket';

      if (queue_type === 'negativas') {
        searchQuery += ' satisfaction_score:bad satisfaction_score:bad_with_comment';
      } else if (queue_type === 'positivas') {
        searchQuery += ' satisfaction_score:good satisfaction_score:good_with_comment';
      } else {
        // Proativas: tickets resolvidos sem pesquisa ou com pesquisa pendente
        searchQuery += ' status:solved status:closed';
      }

      const searchUrl = `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(searchQuery)}&sort_by=created_at&sort_order=desc`;
      const response = await fetch(searchUrl, { headers: zendeskHeaders });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Zendesk Search API falhou (${response.status}): ${errText}`);
      }

      const searchData = await response.json();
      const results = searchData.results || [];

      // Mapeia os tickets para o formato neutro do QualiTrack
      const mappedTickets = results.map((t: any) => {
        let csatStatus: 'bad' | 'good' | 'unrated' = 'unrated';
        if (t.satisfaction_rating?.score === 'bad' || t.satisfaction_rating?.score === 'bad_with_comment') {
          csatStatus = 'bad';
        } else if (t.satisfaction_rating?.score === 'good' || t.satisfaction_rating?.score === 'good_with_comment') {
          csatStatus = 'good';
        }

        return {
          ticket_id: String(t.id),
          subject: t.subject || 'Sem assunto',
          channel: t.via?.channel || 'chat',
          csat_status: csatStatus,
          csat_comment: t.satisfaction_rating?.comment || undefined,
          ticket_date: t.created_at || new Date().toISOString(),
          status: t.status || 'solved',
          url: `https://${subdomain}.zendesk.com/agent/tickets/${t.id}`,
        };
      });

      return jsonResponse({ success: true, tickets: mappedTickets }, 200);
    }

    // 2. Busca de Histórico / Diálogo do Chamado
    if (action === 'fetch_dialogue') {
      if (!ticket_id) {
        return jsonResponse({ error: 'ticket_id é obrigatório para fetch_dialogue' }, 400);
      }

      const commentsUrl = `https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}/comments.json`;
      const response = await fetch(commentsUrl, { headers: zendeskHeaders });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Zendesk Comments API falhou (${response.status}): ${errText}`);
      }

      const commentsData = await response.json();
      const comments = commentsData.comments || [];

      const mappedComments = comments.map((c: any) => ({
        id: c.id,
        author_role: c.public ? 'agent' : 'system',
        created_at: c.created_at,
        body: c.body || c.html_body || '',
        is_public: c.public !== false,
      }));

      return jsonResponse({ success: true, comments: mappedComments }, 200);
    }

    return jsonResponse({ error: 'Ação não suportada' }, 400);
  } catch (error: any) {
    console.error('[helpdesk-queue] Erro:', error);
    return jsonResponse({ error: error.message || 'Erro interno do servidor' }, 500);
  }
});
