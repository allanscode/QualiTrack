import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting em memória (reseta a cada cold start) — mesmo padrão já usado
// em admin-invite-user. Por usuário autenticado (não por IP: esta função
// sempre exige um JWT válido, então o id do usuário é uma chave melhor).
// Dois níveis: um geral (evita loop/script acidental esgotando qualquer
// action) e um mais apertado só pra evaluate_ai, que custa de verdade
// (chamada à IA) e consome a cota diária do token do Zendesk indiretamente.
interface RateLimitEntry { count: number; resetTime: number; }
const rateLimitStore = new Map<string, RateLimitEntry>();

function checkRateLimit(identifier: string, maxRequests: number, windowMs: number): { allowed: boolean; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, resetTime: now + windowMs };
  }
  if (entry.count >= maxRequests) {
    return { allowed: false, resetTime: entry.resetTime };
  }
  entry.count++;
  return { allowed: true, resetTime: entry.resetTime };
}

// Tag aplicada (via macro do Zendesk) quando um chamado negativo já foi
// apurado/validado pela qualidade. Chamados com essa tag saem da fila.
// Sem a secret configurada, NÃO filtramos por tag nenhuma — um nome de tag
// chutado poderia deixar passar negativas que na verdade não foram validadas.
const VALIDATED_TAG = Deno.env.get('HELPDESK_VALIDATED_TAG') || '';

// IDs das views salvas do Zendesk (Admin Center > Views > abrir a view >
// número no final da URL). Quando configuradas, cada fila busca exatamente
// os tickets da view correspondente — já filtrados pela lógica que a
// qualidade mantém lá dentro (ex.: negativas ainda não validadas) — em vez
// de reconstruir o filtro via Search API e arriscar divergir da contagem
// real que a equipe vê no Zendesk.
const NEGATIVE_VIEW_ID = Deno.env.get('HELPDESK_NEGATIVE_VIEW_ID') || '';
const POSITIVE_VIEW_ID = Deno.env.get('HELPDESK_POSITIVE_VIEW_ID') || '';
// Proativas: view real do Zendesk com os tickets de CSAT vazio/não avaliado
// (ex.: 808 pesquisas vazias na view configurada) — antes essa fila não
// buscava ticket nenhum do Zendesk, só sorteava um número de ticket
// FICTÍCIO pra abrir a ficha. Agora usa tickets reais, igual as outras duas.
const PROACTIVE_VIEW_ID = Deno.env.get('HELPDESK_PROACTIVE_VIEW_ID') || '';

// Página pequena (25) em vez de buscar tudo de uma vez — views com centenas
// de tickets (ex.: 808 em Proativas) estourariam o rate limit do Zendesk
// numa carga só. O front pede próxima página sob demanda (botão), passando
// o `cursor` devolvido na resposta anterior.
const PAGE_SIZE = 25;

const RequestSchema = z.object({
  action: z.enum(['fetch_queue', 'fetch_dialogue', 'evaluate_ai', 'resolve_agent', 'lookup_ticket_agent', 'sync_zendesk_groups']),
  queue_type: z.enum(['negativas', 'proativas', 'positivas']).optional(),
  ticket_id: z.string().optional(),
  // Cursor de paginação — vem de um `next_cursor` de uma resposta anterior
  // de fetch_queue. Ausente/null = primeira página.
  cursor: z.string().nullable().optional(),
  form_criteria: z.any().optional(),
  dialogue: z.array(z.any()).optional(),
  agent_info: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    team_name: z.string().optional(),
    channel: z.string().optional(),
  }).optional(),
  // Manuais escolhidos pelo monitor para essa avaliação (ver Admin > Manual
  // da IA). undefined = comportamento antigo (usa todos os ativos, para não
  // quebrar chamadas antigas); [] = avaliar sem nenhum manual.
  guideline_ids: z.array(z.string()).optional(),
  // action: 'resolve_agent' — cadastro manual de um agente do helpdesk que
  // ainda não tem conta no QualiTrack, direto na ficha de monitoria.
  agent_email: z.string().email().optional(),
  agent_name: z.string().optional(),
  team_id: z.string().optional(),
  // Campos de classificação do próprio ticket no Zendesk (categoria, motivo
  // do contato etc.), usados como contexto extra na avaliação com IA.
  ticket_fields: z.array(z.object({ title: z.string(), value: z.string() })).optional(),
});

function jsonResponse(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Garante que exista um usuário QualiTrack correspondente ao e-mail do
 * atendente vindo do helpdesk. Nunca depende de listas locais fixas: usa
 * o e-mail como chave universal de correlação e `external_id`/`source_system`
 * como metadados agnósticos de provider (ver SPEC de mapeamento de agentes).
 * Se o atendente ainda não existe no QualiTrack, cria uma conta provisória
 * (sem senha, sem convite) que é herdada automaticamente quando ele concluir
 * o onboarding formal com o mesmo e-mail (trigger `handle_new_user`).
 */
async function resolveOrCreateAgent(
  supabase: ReturnType<typeof createClient>,
  email: string | undefined,
  name: string | undefined,
  externalId: string | number | undefined,
  sourceSystem: string,
  teamName: string | undefined,
  // Quando o chamador já sabe o team_id exato (ex.: monitor selecionou a
  // equipe na própria ficha), pula o match por nome e usa direto.
  explicitTeamId?: string
): Promise<{ id?: string; team_id?: string } | null> {
  if (!email) return null;
  const normalizedEmail = email.trim().toLowerCase();

  // team_ids não existe mais em public.users (migração 20260522000005) —
  // multi-equipe é via public.user_teams; primary_team_id continua sendo
  // a equipe principal de exibição.
  const { data: existing } = await supabase
    .from('users')
    .select('id, primary_team_id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existing) {
    return { id: existing.id as string, team_id: existing.primary_team_id as string | undefined };
  }

  // Tenta casar a equipe pelo nome do grupo/time do helpdesk (best-effort),
  // a menos que o chamador já tenha passado o team_id explicitamente.
  let teamId: string | undefined = explicitTeamId;
  if (!teamId && teamName) {
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .ilike('name', teamName)
      .maybeSingle();
    teamId = team?.id as string | undefined;
  }

  // public.users.id não tem DEFAULT (normalmente é preenchido com o id do
  // auth.users pelo trigger handle_new_user) — para conta provisória, sem
  // conta de auth ainda, precisamos gerar o UUID explicitamente aqui, senão
  // o insert falha com "null value in column id violates not-null constraint".
  const { data: created, error: createError } = await supabase
    .from('users')
    .insert({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      name: name || normalizedEmail.split('@')[0],
      role: 'suporte',
      active: true,
      must_change_password: false,
      external_id: externalId != null ? String(externalId) : null,
      source_system: sourceSystem,
      is_provisional: true,
      primary_team_id: teamId || null,
    })
    .select('id')
    .single();

  if (createError) {
    console.error('[helpdesk-queue] Falha ao criar agente provisório:', createError.message);
    return teamId ? { team_id: teamId } : null;
  }

  // Espelha o vínculo em user_teams (fonte de verdade para multi-equipe).
  if (teamId) {
    const { error: userTeamError } = await supabase
      .from('user_teams')
      .insert({ user_id: created.id, team_id: teamId });
    if (userTeamError) {
      console.error('[helpdesk-queue] Falha ao vincular agente provisório à equipe:', userTeamError.message);
    }
  }

  return { id: created.id as string, team_id: teamId };
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

    // Autorização por papel: esta função inteira é a Central de Filas, uma
    // tela que o próprio frontend já esconde do papel 'suporte' (ver
    // App.tsx — ele é quem está sendo auditado, não quem audita). Sem essa
    // checagem aqui, qualquer usuário autenticado — inclusive um atendente
    // comum com token JWT válido — podia chamar a Edge Function direto e
    // ler CSAT/transcrições de qualquer ticket da empresa, ou disparar
    // avaliações de IA arbitrárias consumindo a cota da API. `resolve_agent`
    // já tinha essa checagem; faltava nas demais ações.
    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('role, active')
      .eq('id', user.id)
      .maybeSingle();

    const allowedRoles = ['admin', 'gestor_qualidade', 'qualidade', 'gestor_suporte'];
    if (callerError || !caller?.active || !allowedRoles.includes(caller.role as string)) {
      return jsonResponse({ error: 'Sem permissão para acessar a Central de Filas.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return jsonResponse({ error: 'Payload inválido', details: parseResult.error.flatten() }, 400);
    }

    const { action, queue_type, ticket_id } = parseResult.data;

    // Rate limit geral: 60 requisições/minuto por usuário, cobre toda action.
    const general = checkRateLimit(`general:${user.id}`, 60, 60_000);
    if (!general.allowed) {
      return jsonResponse({ error: 'Muitas requisições em pouco tempo. Aguarde um momento e tente de novo.' }, 429);
    }

    // Rate limit apertado só para evaluate_ai: chama a IA (custo real) e
    // indiretamente consome a cota diária do token do Zendesk (via
    // fetch_dialogue, chamado antes pelo frontend). 10 avaliações a cada 5
    // minutos é folgado para revisão manual normal, mas barra um loop/script.
    if (action === 'evaluate_ai') {
      const ai = checkRateLimit(`evaluate_ai:${user.id}`, 10, 5 * 60_000);
      if (!ai.allowed) {
        return jsonResponse({ error: 'Limite de avaliações com IA atingido (10 a cada 5 min). Aguarde um pouco antes de avaliar mais tickets.' }, 429);
      }
    }

    // ticket_id sempre precisa ser o id numérico do ticket no Zendesk — ele
    // é interpolado cru em URLs da API do Zendesk (fetch_dialogue,
    // lookup_ticket_agent). Sem essa validação, um valor como
    // "1/../../users.json#" faz a URL resultante apontar para outro
    // endpoint qualquer do Zendesk (path traversal), usando as credenciais
    // privilegiadas do ZENDESK_API_TOKEN.
    if (ticket_id !== undefined && !/^\d+$/.test(ticket_id)) {
      return jsonResponse({ error: 'ticket_id deve ser numérico.' }, 400);
    }

    // 3. Avaliação com IA (OpenRouter) — não depende do Zendesk
    if (action === 'evaluate_ai') {
      return await handleEvaluateAI(parseResult.data, supabase);
    }

    // 4. Cadastro manual de agente ainda não existente no QualiTrack, feito
    // direto na ficha de monitoria (não depende do Zendesk).
    if (action === 'resolve_agent') {
      return await handleResolveAgent(parseResult.data, supabase, user.id);
    }

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

    // 6. Importa os grupos (equipes) do Zendesk como Teams do QualiTrack —
    // cria só os que ainda não existem (casados por nome, sem duplicar).
    // Restrito a admin: criar Team usa a mesma regra de RLS de
    // TeamsManagement (só admin escreve em public.teams), e aqui a Edge
    // Function usa service role (ignora RLS), então a checagem é manual.
    if (action === 'sync_zendesk_groups') {
      if (caller.role !== 'admin') {
        return jsonResponse({ error: 'Apenas administradores podem sincronizar equipes do Zendesk.' }, 403);
      }

      const groupsResp = await fetch(`https://${subdomain}.zendesk.com/api/v2/groups.json`, { headers: zendeskHeaders });
      if (!groupsResp.ok) {
        const errText = await groupsResp.text().catch(() => '');
        throw new Error(`Zendesk Groups API falhou (${groupsResp.status}): ${errText}`);
      }
      const groupsData = await groupsResp.json();
      const zendeskGroups: { id: number; name: string }[] = groupsData.groups || [];

      const { data: existingTeams } = await supabase.from('teams').select('name');
      const existingNames = new Set((existingTeams || []).map((t: any) => (t.name as string).trim().toLowerCase()));

      const created: string[] = [];
      const skipped: string[] = [];

      for (const g of zendeskGroups) {
        const name = (g.name || '').trim();
        if (!name) continue;
        if (existingNames.has(name.toLowerCase())) {
          skipped.push(name);
          continue;
        }
        const { error: insertError } = await supabase.from('teams').insert({ name, active: true });
        if (insertError) {
          console.error(`[helpdesk-queue] Falha ao criar equipe "${name}":`, insertError.message);
          continue;
        }
        existingNames.add(name.toLowerCase());
        created.push(name);
      }

      return jsonResponse({ success: true, created, skipped }, 200);
    }

    // 1. Busca de Fila de Chamados — sempre UMA página por chamada (25
    // tickets). Views grandes (Proativas tinha 808 pesquisas vazias) não
    // cabem numa carga só sem estourar o rate limit do Zendesk; o front pede
    // a próxima página sob demanda, passando o `cursor` da resposta anterior.
    if (action === 'fetch_queue') {
      let results: any[];
      let sideloadedUsers: Map<number, any>;
      let sideloadedGroups: Map<number, any>;
      let nextCursor: string | null = null;
      let hasMore = false;

      // Quando a view real do Zendesk está configurada, busca exatamente os
      // tickets dela (mesma contagem que a equipe vê lá dentro), em vez de
      // reconstruir o filtro via Search API.
      const viewId = queue_type === 'negativas' ? NEGATIVE_VIEW_ID
        : queue_type === 'positivas' ? POSITIVE_VIEW_ID
        : queue_type === 'proativas' ? PROACTIVE_VIEW_ID
        : '';

      if (viewId) {
        const url = parseResult.data.cursor
          || `https://${subdomain}.zendesk.com/api/v2/views/${viewId}/tickets.json?include=users,groups&page[size]=${PAGE_SIZE}`;

        const response = await fetch(url, { headers: zendeskHeaders });
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Zendesk Views API falhou (${response.status}): ${errText}`);
        }

        const viewData = await response.json();
        results = viewData.tickets || [];
        sideloadedUsers = new Map<number, any>((viewData.users || []).map((u: any) => [u.id, u]));
        sideloadedGroups = new Map<number, any>((viewData.groups || []).map((g: any) => [g.id, g]));
        hasMore = !!viewData.meta?.has_more;
        nextCursor = hasMore ? (viewData.links?.next || null) : null;
      } else {
        let searchQuery = 'type:ticket';

        if (queue_type === 'negativas') {
          searchQuery += ' satisfaction_score:bad satisfaction_score:bad_with_comment';
          // Chamados já apurados/validados pela qualidade (tag aplicada via
          // macro) saem da fila — só filtra se a tag real estiver configurada.
          if (VALIDATED_TAG) {
            searchQuery += ` -tags:${VALIDATED_TAG}`;
          }
        } else if (queue_type === 'positivas') {
          searchQuery += ' satisfaction_score:good satisfaction_score:good_with_comment';
        } else {
          // Proativas: CSAT nunca respondido pelo cliente (não é "sem
          // filtro nenhum" como antes — isso trazia qualquer ticket
          // solved/closed, sem relação com equidade de monitoria).
          searchQuery += ' satisfaction_score:unoffered';
        }

        // Sideload de usuários e grupos para resolver o atendente (nome/e-mail)
        // e a equipe de origem de cada chamado, sem depender de lista local.
        const url = parseResult.data.cursor
          || `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(searchQuery)}&sort_by=created_at&sort_order=desc&include=users,groups&page[size]=${PAGE_SIZE}`;
        const response = await fetch(url, { headers: zendeskHeaders });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Zendesk Search API falhou (${response.status}): ${errText}`);
        }

        const searchData = await response.json();
        results = searchData.results || [];
        sideloadedUsers = new Map<number, any>((searchData.users || []).map((u: any) => [u.id, u]));
        sideloadedGroups = new Map<number, any>((searchData.groups || []).map((g: any) => [g.id, g]));
        hasMore = !!searchData.meta?.has_more;
        nextCursor = hasMore ? (searchData.links?.next || null) : null;
      }

      // Resolve/garante o vínculo do agente no QualiTrack pelo e-mail (chave
      // universal), criando conta provisória quando necessário. Só roda
      // pros ~25 tickets desta página, não pra view inteira.
      const mappedTickets = await Promise.all(results.map(async (t: any) => {
        let csatStatus: 'bad' | 'good' | 'unrated' = 'unrated';
        if (t.satisfaction_rating?.score === 'bad' || t.satisfaction_rating?.score === 'bad_with_comment') {
          csatStatus = 'bad';
        } else if (t.satisfaction_rating?.score === 'good' || t.satisfaction_rating?.score === 'good_with_comment') {
          csatStatus = 'good';
        }

        const assignee = t.assignee_id ? sideloadedUsers.get(t.assignee_id) : undefined;
        const group = t.group_id ? sideloadedGroups.get(t.group_id) : undefined;

        const agentLink = await resolveOrCreateAgent(
          supabase,
          assignee?.email,
          assignee?.name,
          assignee?.id,
          'zendesk',
          group?.name
        );

        return {
          ticket_id: String(t.id),
          subject: t.subject || 'Sem assunto',
          channel: t.via?.channel || 'chat',
          csat_status: csatStatus,
          csat_comment: t.satisfaction_rating?.comment || undefined,
          ticket_date: t.created_at || new Date().toISOString(),
          status: t.status || 'solved',
          url: `https://${subdomain}.zendesk.com/agent/tickets/${t.id}`,
          agent_name: assignee?.name,
          agent_email: assignee?.email,
          agent_id: agentLink?.id,
          team_id: agentLink?.team_id,
        };
      }));

      return jsonResponse({ success: true, tickets: mappedTickets, next_cursor: nextCursor, has_more: hasMore }, 200);
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

      // Campos de classificação preenchidos pelo atendente no próprio
      // ticket (categoria, motivo do contato, tipificação etc.) — servem
      // de contexto extra pra IA avaliar, sem preencher nada sozinhos na
      // ficha. custom_fields do ticket só traz {id, value}; ticket_fields.json
      // traz o título legível e, pra campos de seleção, o rótulo de cada
      // opção (o value bruto do ticket é só a "tag" interna, não o texto
      // que o atendente via na tela).
      let ticket_fields: { title: string; value: string }[] = [];
      try {
        const [ticketResp, fieldsResp] = await Promise.all([
          fetch(`https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}.json`, { headers: zendeskHeaders }),
          fetch(`https://${subdomain}.zendesk.com/api/v2/ticket_fields.json`, { headers: zendeskHeaders }),
        ]);

        if (ticketResp.ok && fieldsResp.ok) {
          const ticketJson = await ticketResp.json();
          const fieldsJson = await fieldsResp.json();
          const customFields: { id: number; value: any }[] = ticketJson.ticket?.custom_fields || [];
          const fieldDefs = new Map<number, any>((fieldsJson.ticket_fields || []).map((f: any) => [f.id, f]));

          ticket_fields = customFields
            .filter(cf => cf.value !== null && cf.value !== undefined && cf.value !== '')
            .map(cf => {
              const def = fieldDefs.get(cf.id);
              const title = def?.title_in_portal || def?.title || `Campo ${cf.id}`;
              const option = def?.custom_field_options?.find((o: any) => o.value === cf.value);
              const value = option?.name || (Array.isArray(cf.value) ? cf.value.join(', ') : String(cf.value));
              return { title, value };
            });
        }
      } catch (e) {
        // Campos de classificação são só um bônus de contexto — falha aqui
        // não deve impedir a avaliação de seguir com a transcrição normal.
        console.warn('[helpdesk-queue] Falha ao buscar campos de classificação do ticket:', e);
      }

      return jsonResponse({ success: true, comments: mappedComments, ticket_fields }, 200);
    }

    // 5. Busca só o atendente responsável por um ticket digitado manualmente
    // na ficha (sem passar pela Central de Filas) — não cria nada no banco,
    // é só consulta. O front decide se já existe conta ou se mostra o aviso
    // de "agente não cadastrado".
    if (action === 'lookup_ticket_agent') {
      if (!ticket_id || !/^\d+$/.test(ticket_id)) {
        return jsonResponse({ error: 'ticket_id numérico é obrigatório para lookup_ticket_agent' }, 400);
      }

      const ticketUrl = `https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}.json?include=users,groups`;
      const response = await fetch(ticketUrl, { headers: zendeskHeaders });

      if (response.status === 404) {
        return jsonResponse({ success: true, agent: null }, 200);
      }
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Zendesk Ticket API falhou (${response.status}): ${errText}`);
      }

      const ticketData = await response.json();
      const t = ticketData.ticket;
      const assignee = (ticketData.users || []).find((u: any) => u.id === t?.assignee_id);
      const group = (ticketData.groups || []).find((g: any) => g.id === t?.group_id);

      if (!assignee?.email) {
        return jsonResponse({ success: true, agent: null }, 200);
      }

      const { data: existing } = await supabase
        .from('users')
        .select('id, name, primary_team_id')
        .eq('email', assignee.email.trim().toLowerCase())
        .maybeSingle();

      return jsonResponse({
        success: true,
        agent: {
          name: assignee.name,
          email: assignee.email,
          team_name: group?.name,
          channel: t?.via?.channel,
          existing_id: existing?.id || null,
          existing_team_id: existing?.primary_team_id || null,
        },
      }, 200);
    }

    return jsonResponse({ error: 'Ação não suportada' }, 400);
  } catch (error: any) {
    console.error('[helpdesk-queue] Erro:', error);
    return jsonResponse({ error: error.message || 'Erro interno do servidor' }, 500);
  }
});

/**
 * Avalia um atendimento com um modelo gratuito via OpenRouter (API
 * compatível com o formato OpenAI Chat Completions), usando
 * response_format: json_schema para forçar retorno em JSON estrito,
 * alinhado aos critérios da ficha de monitoria enviada pelo front-end.
 */
/**
 * Cadastro manual de um agente do helpdesk que ainda não tem conta no
 * QualiTrack, disparado direto da ficha de monitoria (não só da triagem
 * automática). Mesma lógica de conta provisória por e-mail — restrito a
 * quem já pode criar monitoria (senão qualquer usuário autenticado poderia
 * criar linhas em public.users através dessa função, já que ela roda com
 * service role e ignora RLS).
 */
async function handleResolveAgent(
  payload: z.infer<typeof RequestSchema>,
  supabase: ReturnType<typeof createClient>,
  callerId: string
): Promise<Response> {
  const { agent_email, agent_name, team_id } = payload;

  if (!agent_email) {
    return jsonResponse({ error: 'agent_email é obrigatório' }, 400);
  }

  const { data: caller } = await supabase
    .from('users')
    .select('role, active')
    .eq('id', callerId)
    .maybeSingle();

  const allowedRoles = ['admin', 'gestor_qualidade', 'qualidade', 'gestor_suporte'];
  if (!caller?.active || !allowedRoles.includes(caller.role as string)) {
    return jsonResponse({ error: 'Sem permissão para cadastrar agentes.' }, 403);
  }

  const agent = await resolveOrCreateAgent(supabase, agent_email, agent_name, undefined, 'manual', undefined, team_id);

  if (!agent?.id) {
    return jsonResponse({ error: 'Falha ao cadastrar o agente.' }, 500);
  }

  return jsonResponse({ success: true, agent }, 200);
}

/**
 * O responseSchema do Gemini aceita só um subconjunto do OpenAPI 3.0 Schema
 * (type, properties, required, items, enum, description, etc.) — não aceita
 * "additionalProperties", que o schema usado no OpenRouter tem em todo
 * objeto (pra reforçar o strict mode lá). Remove recursivamente antes de
 * mandar pro Gemini; o schema original (com additionalProperties) continua
 * sendo usado pra validar a resposta depois do parse, então a garantia de
 * formato não é perdida, só não é reforçada do lado do provedor.
 */
function stripAdditionalProperties(schema: any): any {
  if (Array.isArray(schema)) return schema.map(stripAdditionalProperties);
  if (schema && typeof schema === 'object') {
    const { additionalProperties: _omit, ...rest } = schema;
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(rest)) {
      out[key] = stripAdditionalProperties(value);
    }
    return out;
  }
  return schema;
}

async function handleEvaluateAI(
  payload: z.infer<typeof RequestSchema>,
  supabase: ReturnType<typeof createClient>
): Promise<Response> {
  const { ticket_id, form_criteria, dialogue, agent_info, guideline_ids, ticket_fields } = payload;

  if (!ticket_id || !form_criteria?.sections) {
    return jsonResponse({ error: 'ticket_id e form_criteria são obrigatórios para evaluate_ai' }, 400);
  }

  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
  // Testado manualmente com o schema real (16 critérios): DeepSeek e Gemini
  // não têm nenhum modelo :free no OpenRouter atualmente — só modelos que
  // seguem essa cadeia foram confirmados respeitando o json_schema à risca
  // (via grammar constraint nativo do provedor). minimax-m3/m2.7 e
  // dots-studio IGNORAM o schema e devolvem 200 OK com campos inventados —
  // mais perigoso que lento, corrompe a ficha em silêncio se não fosse a
  // validação após o parse. nemotron-3-ultra (550B) vai primeiro: mesma
  // confiabilidade do -super, mas ~10x menos tokens de raciocínio pra
  // chegar na resposta — só é mais sujeito a "sobrecarregado" no pool
  // compartilhado (modelo grande), por isso o -super continua logo atrás
  // como fallback comprovado. gemma/minimax só como último recurso.
  const openRouterModels = (Deno.env.get('OPENROUTER_MODEL') || 'nvidia/nemotron-3-ultra-550b-a55b:free,nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-31b-it:free,minimax/minimax-m3:free')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);

  // Fallback opcional: quando os modelos :free do pool compartilhado do
  // OpenRouter estão indisponíveis/sobrecarregados (erro de rede, 429, ou
  // resposta que não segue o schema), tenta direto na API do Gemini
  // (Google AI Studio) antes de desistir e cair no fallback local do
  // front-end. Sem GEMINI_API_KEY configurada, o comportamento é o mesmo
  // de antes (só OpenRouter). gemini-3.6-flash é o sucessor recomendado
  // pelo próprio Google para o antigo gemini-2.5-flash (descontinuado para
  // novas chaves) — testado manualmente e confirmado respeitando
  // responseSchema estrito.
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';

  if (!openRouterApiKey && !geminiApiKey) {
    return jsonResponse({ error: 'Nenhum provedor de IA configurado (OPENROUTER_API_KEY ou GEMINI_API_KEY) no Supabase Secrets' }, 500);
  }

  // Monta o JSON Schema dinamicamente a partir das perguntas da ficha,
  // garantindo que a IA responda nota/justificativa para cada critério.
  const questionProperties: Record<string, any> = {};
  const questionRequired: string[] = [];

  for (const section of form_criteria.sections) {
    for (const q of section.questions || []) {
      const props: Record<string, any> = {
        answer: { type: 'string', enum: ['SIM', 'NAO', 'NA'] },
        justification: { type: 'string', description: 'Justificativa citando trecho literal do diálogo.' },
      };
      const required = ['answer', 'justification'];
      if (q.is_critical) {
        props.critical_error = { type: 'boolean', description: 'true se o erro crítico ocorreu.' };
        required.push('critical_error');
      }
      questionProperties[q.id] = { type: 'object', properties: props, required, additionalProperties: false };
      questionRequired.push(q.id);
    }
  }

  // A ORDEM das propriedades importa de verdade: no modo de geração
  // estruturada, o modelo preenche os campos na ordem em que aparecem no
  // schema. Com score/summary vindo ANTES de answers, testes reais mostraram
  // o modelo "reservando" score:0 e summary:"" antes de ter avaliado
  // qualquer critério — respostas técnicamente válidas (passavam no
  // typeof), mas semanticamente vazias. `answers` vem primeiro agora, e o
  // agregado (score/summary/pontos fortes/melhorias) só depois, obrigando o
  // raciocínio a acontecer antes do resumo.
  const responseSchema = {
    type: 'object',
    properties: {
      answers: { type: 'object', properties: questionProperties, required: questionRequired, additionalProperties: false },
      strengths: { type: 'array', items: { type: 'string' }, description: 'Pontos fortes observados, com base nas respostas acima.' },
      improvements: { type: 'array', items: { type: 'string' }, description: 'Oportunidades de melhoria, com base nas respostas acima.' },
      summary: { type: 'string', description: 'Resumo executivo do atendimento, escrito por último, com base em tudo já respondido.' },
      score: { type: 'number', description: 'Nota geral de 0 a 100, calculada por último a partir das respostas de "answers".' },
    },
    required: ['answers', 'strengths', 'improvements', 'summary', 'score'],
    additionalProperties: false,
  };

  const dialogueText = (dialogue || [])
    .map((m: any) => `[${m.author_role === 'agent' ? 'ATENDENTE' : m.author_role === 'end_user' ? 'CLIENTE' : 'SISTEMA'}] ${m.author_name || ''}: ${m.body}`)
    .join('\n');

  const criteriaText = form_criteria.sections
    .map((s: any) => `Seção "${s.title}":\n${(s.questions || []).map((q: any) => `- [${q.id}] ${q.text}${q.is_critical ? ' (ERRO CRÍTICO)' : ''}`).join('\n')}`)
    .join('\n\n');

  // Manual de padrões de atendimento (cadastrado em Admin > Manual da IA):
  // contexto normativo adicional além dos critérios da própria ficha.
  // Limitado em tamanho para não estourar o contexto do modelo gratuito.
  const MAX_GUIDELINES_CHARS = 6000;
  let guidelinesText = '';
  // guideline_ids: undefined = comportamento antigo (todos os ativos, para
  // não quebrar chamadas de código anterior); [] = o monitor escolheu
  // avaliar sem nenhum manual — economiza tokens não buscando nada.
  if (guideline_ids === undefined || guideline_ids.length > 0) {
  try {
    let query = supabase
      .from('ai_evaluation_guidelines')
      .select('title, content')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (guideline_ids !== undefined) {
      query = query.in('id', guideline_ids);
    }

    const { data: guidelines } = await query;

    if (guidelines?.length) {
      const combined = guidelines
        .map((g: any) => `### ${g.title}\n${g.content}`)
        .join('\n\n');
      guidelinesText = combined.length > MAX_GUIDELINES_CHARS
        ? combined.slice(0, MAX_GUIDELINES_CHARS) + '\n[...conteúdo truncado...]'
        : combined;
    }
  } catch (e) {
    console.warn('[helpdesk-queue] Falha ao carregar manuais de avaliação (seguindo sem eles):', e);
  }
  }

  const ticketFieldsText = (ticket_fields || [])
    .map(f => `- ${f.title}: ${f.value}`)
    .join('\n');

  const prompt = `Você é um analista sênior de qualidade de atendimento ao cliente da WebPosto.
Avalie o atendimento abaixo com base na ficha de critérios fornecida${guidelinesText ? ' e no manual de padrões de atendimento abaixo' : ''}.
${guidelinesText ? `\nMANUAL DE PADRÕES DE ATENDIMENTO (referência normativa da empresa):\n${guidelinesText}\n` : ''}
DADOS DO ATENDIMENTO:
- Atendente: ${agent_info?.name || 'não informado'}
- E-mail: ${agent_info?.email || 'não informado'}
- Equipe: ${agent_info?.team_name || 'não informada'}
- Canal: ${agent_info?.channel || 'não informado'}
- Ticket: #${ticket_id}
${ticketFieldsText ? `\nCAMPOS DE CLASSIFICAÇÃO PREENCHIDOS PELO ATENDENTE NO TICKET (contexto adicional, use para
entender categoria/motivo do contato, mas não invente critério novo com base neles):\n${ticketFieldsText}\n` : ''}
CRITÉRIOS DA FICHA DE MONITORIA:
${criteriaText}

TRANSCRIÇÃO COMPLETA DO ATENDIMENTO:
${dialogueText || '(sem mensagens registradas)'}

Siga esta ORDEM de raciocínio, sem pular etapas:
1. Para cada critério da ficha, responda SIM, NAO ou NA e justifique citando um trecho literal do diálogo
   sempre que possível. Use o manual de padrões e os campos de classificação do ticket (quando fornecidos)
   como contexto, mas responda SEMPRE aos critérios exatos da ficha — nunca invente critérios que não estão nela.
2. SÓ DEPOIS de responder todos os critérios, liste pontos fortes e oportunidades de melhoria concretas,
   baseadas apenas no que está na transcrição.
3. Por último, calcule a nota geral (score de 0 a 100, nunca 0 a menos que o atendimento tenha sido
   genuinamente péssimo em todos os critérios) e escreva o resumo executivo — ambos com base no que você
   já respondeu nos passos 1 e 2. NUNCA deixe "score" ou "summary" vazios/zerados: eles resumem o que você
   acabou de avaliar.`;

  // Faz a chamada num provedor específico e devolve o JSON já parseado e
  // validado contra o schema — ou lança erro (rede, HTTP, ou resposta fora
  // do formato esperado) pra quem chamou decidir se tenta o próximo provedor.
  async function callAndValidate(provider: 'openrouter' | 'gemini'): Promise<any> {
    let text: string | undefined;

    if (provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openRouterApiKey}`,
          // Cabeçalhos recomendados pelo OpenRouter para identificar a app
          // (não obrigatórios, mas ajudam a evitar throttling nos modelos :free).
          'HTTP-Referer': Deno.env.get('FRONTEND_URL') || 'https://qualitrack.app',
          'X-Title': 'QualiTrack',
        },
        body: JSON.stringify({
          models: openRouterModels,
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'avaliacao_atendimento', strict: true, schema: responseSchema },
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`OpenRouter API falhou (${response.status}): ${errText}`);
      }

      const data = await response.json();
      text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Resposta vazia da IA (modelo pode ter recusado ou atingido limite gratuito)');
      }
    } else {
      // API nativa do Gemini (Google AI Studio) — formato de request e de
      // schema diferentes do padrão OpenAI usado pelo OpenRouter acima.
      // responseSchema do Gemini é um subconjunto do OpenAPI 3.0 Schema e
      // não aceita "additionalProperties", por isso o schema é limpo antes
      // de ir na requisição (o schema completo, com additionalProperties,
      // continua sendo usado pra validar a resposta abaixo).
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiApiKey!,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
              responseSchema: stripAdditionalProperties(responseSchema),
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Gemini API falhou (${response.status}): ${errText}`);
      }

      const data = await response.json();
      text = (data.candidates?.[0]?.content?.parts || [])
        .map((p: any) => p.text || '')
        .join('');
      if (!text) {
        throw new Error('Resposta vazia do Gemini (pode ter sido bloqueada por filtro de segurança ou cota esgotada)');
      }
    }

    // Alguns modelos gratuitos ignoram o strict mode e envolvem o JSON em
    // um bloco markdown (```json ... ```) — remove antes de fazer o parse.
    text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    const parsed = JSON.parse(text);

    // Nem todo modelo gratuito do pool compartilhado respeita de fato o
    // json_schema (alguns simplesmente ignoram e inventam campos próprios,
    // mesmo retornando 200 OK) — sem essa checagem, uma resposta fora do
    // formato passaria batido e corromperia a ficha silenciosamente com
    // campos vazios/undefined em vez de cair no fallback local.
    // "score"/"summary" com typeof correto mas VAZIOS (0 / "") já aconteceu
    // na prática — o modelo respondeu certinho os critérios mas "reservou"
    // o agregado sem preencher de verdade. Rejeita isso também, não só o
    // typeof errado, senão a ficha é salva com nota 0 e resumo em branco.
    const hasAllQuestions = questionRequired.every(qId => parsed.answers?.[qId]?.answer);
    const hasRealScore = typeof parsed.score === 'number' && parsed.score > 0;
    const hasRealSummary = typeof parsed.summary === 'string' && parsed.summary.trim().length > 0;
    if (!hasRealScore || !hasRealSummary || !hasAllQuestions) {
      throw new Error('Resposta da IA fora do formato esperado (modelo não seguiu o schema).');
    }

    return parsed;
  }

  try {
    let parsed: any;
    let lastError: any;

    if (openRouterApiKey) {
      try {
        parsed = await callAndValidate('openrouter');
      } catch (e: any) {
        lastError = e;
        console.warn('[helpdesk-queue] OpenRouter falhou ou respondeu fora do schema, tentando fallback Gemini:', e.message);
      }
    }

    if (!parsed && geminiApiKey) {
      try {
        parsed = await callAndValidate('gemini');
      } catch (e: any) {
        lastError = e;
        console.error('[helpdesk-queue] Fallback Gemini também falhou:', e.message);
      }
    }

    if (!parsed) {
      throw lastError || new Error('Nenhum provedor de IA disponível');
    }

    const suggested_answers: Record<string, string> = {};
    const suggested_observations: Record<string, string> = {};
    const suggested_critical_errors: Record<string, boolean> = {};

    for (const [qId, value] of Object.entries<any>(parsed.answers || {})) {
      suggested_answers[qId] = value.answer;
      suggested_observations[qId] = value.justification;
      if (value.critical_error !== undefined) {
        suggested_critical_errors[qId] = value.critical_error;
      }
    }

    return jsonResponse({
      success: true,
      result: {
        score: parsed.score,
        summary: parsed.summary,
        strengths: parsed.strengths || [],
        improvements: parsed.improvements || [],
        suggested_answers,
        suggested_observations,
        suggested_critical_errors,
      },
    }, 200);
  } catch (error: any) {
    console.error('[helpdesk-queue] Erro na avaliação com IA (todos os provedores falharam):', error);
    return jsonResponse({ error: error.message || 'Falha ao avaliar com IA' }, 502);
  }
}
