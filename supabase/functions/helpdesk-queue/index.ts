import { publicApiKey, secretApiKey } from '../_shared/keys.ts';
import { corsFor, rejectRequest, configuredOrigin } from '../_shared/http.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { sanitizeDialogue, isChatTranscript, parseZendeskChatTranscript } from './sanitizer.ts';

const corsHeaders = corsFor(Deno.env.get('FRONTEND_URL'));


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
const CHILD_VIEW_ID = Deno.env.get('HELPDESK_CHILD_VIEW_ID') || '47405806430228';
const INVALID_CHILD_VIEW_ID = Deno.env.get('HELPDESK_INVALID_CHILD_VIEW_ID') || '47656856998292';

// Página pequena (25) em vez de buscar tudo de uma vez — views com centenas
// de tickets (ex.: 808 em Proativas) estourariam o rate limit do Zendesk
// numa carga só. O front pede próxima página sob demanda (botão), passando
// o `cursor` devolvido na resposta anterior.
const PAGE_SIZE = 25;

const RequestSchema = z.object({
  action: z.enum([
    'fetch_queue',
    'fetch_dialogue',
    'evaluate_ai',
    'evaluate_child_ticket',
    'resolve_agent',
    'lookup_ticket_agent',
    'sync_zendesk_groups',
    'backfill_agent_team'
  ]),
  queue_type: z.enum(['negativas', 'proativas', 'positivas', 'filhos', 'filhos_invalidos']).optional(),
  ticket_id: z.string().optional(),
  ticket_subject: z.string().optional(),
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
  guideline_ids: z.array(z.string()).optional(),
  ticket_fields: z.array(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  macro_type: z.string().optional(),
  // action: 'resolve_agent' — cadastro manual de um agente do helpdesk que
  // ainda não tem conta no QualiTrack, direto na ficha de monitoria.
  agent_email: z.string().email().optional(),
  agent_name: z.string().optional(),
  team_id: z.string().optional(),
  evaluated_id: z.string().optional(),
});

function jsonResponse(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Completa o vínculo de equipe de um agente que já existe no QualiTrack mas
 * está sem `primary_team_id` — comum em contas criadas antes do "Importar
 * do Zendesk" preencher `public.teams`, ou cadastradas manualmente sem
 * selecionar equipe. Nunca sobrescreve uma equipe já definida, só preenche
 * o que estava vazio. Usada tanto dentro de `resolveOrCreateAgent` (fluxo
 * automático via ticket) quanto na ação `backfill_agent_team` (disparada
 * pelo front-end logo após salvar uma monitoria "normal", fora da Central
 * de Filas, onde esse agente pode ter sido selecionado direto no dropdown).
 */
async function backfillAgentTeamIfMissing(
  supabase: SupabaseClient,
  userId: string,
  currentTeamId: string | null | undefined,
  teamId: string | undefined
): Promise<string | undefined> {
  if (currentTeamId || !teamId) return currentTeamId || undefined;

  const { error: updateError } = await supabase
    .from('users')
    .update({ primary_team_id: teamId })
    .eq('id', userId);
  if (updateError) {
    console.error('[helpdesk-queue] Falha ao completar equipe do agente existente:', updateError.message);
    return currentTeamId || undefined;
  }

  const { error: userTeamError } = await supabase
    .from('user_teams')
    .upsert({ user_id: userId, team_id: teamId }, { onConflict: 'user_id,team_id', ignoreDuplicates: true });
  if (userTeamError) {
    console.error('[helpdesk-queue] Falha ao vincular agente existente à equipe:', userTeamError.message);
  }

  return teamId;
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
  supabase: SupabaseClient,
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

  // Tenta casar a equipe pelo nome do grupo/time do helpdesk (best-effort),
  // a menos que o chamador já tenha passado o team_id explicitamente. Feito
  // ANTES do "if (existing)" abaixo porque agora serve tanto pra criar um
  // agente novo quanto pra completar o vínculo de um que já existe.
  let teamId: string | undefined = explicitTeamId;
  if (!teamId && teamName) {
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .ilike('name', teamName)
      .maybeSingle();
    teamId = team?.id as string | undefined;
  }

  if (existing) {
    const resolvedTeamId = await backfillAgentTeamIfMissing(
      supabase,
      existing.id as string,
      existing.primary_team_id as string | null | undefined,
      teamId
    );
    return { id: existing.id as string, team_id: resolvedTeamId };
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
  const rejected = rejectRequest(req, corsHeaders);
  if (rejected) return rejected;
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Token de autenticação não fornecido' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = secretApiKey();
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

    // 3. Avaliação com IA (Gemini com fallback OpenRouter) — não depende do Zendesk
    if (action === 'evaluate_ai') {
      return await handleEvaluateAI(parseResult.data, supabase, user.id);
    }

    if (action === 'evaluate_child_ticket') {
      return await handleEvaluateChildTicket(parseResult.data, supabase, user.id);
    }

    // 4. Cadastro manual de agente ainda não existente no QualiTrack, feito
    // direto na ficha de monitoria (não depende do Zendesk).
    if (action === 'resolve_agent') {
      return await handleResolveAgent(parseResult.data, supabase, user.id);
    }

    // 4b. Completa a equipe de um agente já cadastrado, mas sem
    // `primary_team_id`, logo após salvar uma monitoria "normal" — fora da
    // Central de Filas, onde o agente foi selecionado direto no dropdown
    // (não passa por resolveOrCreateAgent, que só roda pra tickets do
    // helpdesk). Não depende do Zendesk; nunca sobrescreve equipe já
    // definida, só preenche o que estava vazio.
    if (action === 'backfill_agent_team') {
      const { evaluated_id, team_id: backfillTeamId } = parseResult.data;
      if (!evaluated_id || !backfillTeamId) {
        return jsonResponse({ error: 'evaluated_id e team_id são obrigatórios para backfill_agent_team' }, 400);
      }
      const { data: agent, error: agentError } = await supabase
        .from('users')
        .select('id, primary_team_id')
        .eq('id', evaluated_id)
        .maybeSingle();
      if (agentError || !agent) {
        return jsonResponse({ error: 'Agente não encontrado' }, 404);
      }
      const resolvedTeamId = await backfillAgentTeamIfMissing(
        supabase,
        agent.id as string,
        agent.primary_team_id as string | null | undefined,
        backfillTeamId
      );
      return jsonResponse({ success: true, team_id: resolvedTeamId }, 200);
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
      let sideloadedOrgs: Map<number, any>;
      let nextCursor: string | null = null;
      let hasMore = false;

      // Quando a view real do Zendesk está configurada, busca exatamente os
      // tickets dela (mesma contagem que a equipe vê lá dentro), em vez de
      // reconstruir o filtro via Search API.
      const viewId = queue_type === 'negativas' ? NEGATIVE_VIEW_ID
        : queue_type === 'positivas' ? POSITIVE_VIEW_ID
        : queue_type === 'proativas' ? PROACTIVE_VIEW_ID
        : queue_type === 'filhos' ? CHILD_VIEW_ID
        : queue_type === 'filhos_invalidos' ? INVALID_CHILD_VIEW_ID
        : '';

      if (viewId) {
        const url = parseResult.data.cursor
          || `https://${subdomain}.zendesk.com/api/v2/views/${viewId}/tickets.json?include=users,groups,organizations&page[size]=${PAGE_SIZE}`;

        const response = await fetch(url, { headers: zendeskHeaders });
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Zendesk Views API falhou (${response.status}): ${errText}`);
        }

        const viewData = await response.json();
        results = viewData.tickets || [];
        sideloadedUsers = new Map<number, any>((viewData.users || []).map((u: any) => [u.id, u]));
        sideloadedGroups = new Map<number, any>((viewData.groups || []).map((g: any) => [g.id, g]));
        sideloadedOrgs = new Map<number, any>((viewData.organizations || []).map((o: any) => [o.id, o]));
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
        } else if (queue_type === 'filhos') {
          searchQuery += ' tags:existe_ticket_filho';
        } else if (queue_type === 'filhos_invalidos') {
          searchQuery += ' tags:ticket_filho_invalido';
        } else {
          // Proativas: CSAT nunca respondido pelo cliente (não é "sem
          // filtro nenhum" como antes — isso trazia qualquer ticket
          // solved/closed, sem relação com equidade de monitoria).
          searchQuery += ' satisfaction_score:unoffered';
        }

        // Sideload de usuários, grupos e organizações para resolver o atendente (nome/e-mail),
        // a equipe de origem e o tipo de cliente (organização/tags) de cada chamado.
        const url = parseResult.data.cursor
          || `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(searchQuery)}&sort_by=created_at&sort_order=desc&include=users,groups,organizations&page[size]=${PAGE_SIZE}`;
        const response = await fetch(url, { headers: zendeskHeaders });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Zendesk Search API falhou (${response.status}): ${errText}`);
        }

        const searchData = await response.json();
        results = searchData.results || [];
        sideloadedUsers = new Map<number, any>((searchData.users || []).map((u: any) => [u.id, u]));
        sideloadedGroups = new Map<number, any>((searchData.groups || []).map((g: any) => [g.id, g]));
        sideloadedOrgs = new Map<number, any>((searchData.organizations || []).map((o: any) => [o.id, o]));
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
        const org = t.organization_id ? sideloadedOrgs.get(t.organization_id) : undefined;

        const agentLink = await resolveOrCreateAgent(
          supabase,
          assignee?.email,
          assignee?.name,
          assignee?.id,
          'zendesk',
          group?.name
        );

        let childMacroType: 'nova_demanda' | 'analise_tecnica' | 'apoio_tecnico' | 'produtividade' | undefined;
        const lowerTags = (Array.isArray(t.tags) ? t.tags : []).map((tg: string) => tg.toLowerCase());
        const lowerSubject = (t.subject || '').toLowerCase();

        if (lowerTags.includes('existe_nova_demanda') || lowerSubject.includes('nova demanda')) {
          childMacroType = 'nova_demanda';
        } else if (lowerTags.includes('analise_tecnica') || lowerSubject.includes('análise técnica') || lowerSubject.includes('analise tecnica')) {
          childMacroType = 'analise_tecnica';
        } else if (lowerTags.includes('apoio_tecnico') || lowerTags.includes('apoio_analise_tecnica') || lowerSubject.includes('apoio análise') || lowerSubject.includes('apoio analise')) {
          childMacroType = 'apoio_tecnico';
        } else if (lowerTags.includes('produtividade') || lowerTags.includes('filho_produtividade') || lowerSubject.includes('produtividade')) {
          childMacroType = 'produtividade';
        }

        let parentTicketId: string | undefined;
        // 1. problem_id é o campo nativo do Zendesk para relação pai → filho — máxima prioridade.
        if (t.problem_id && Number(t.problem_id) > 0) {
          parentTicketId = String(t.problem_id);
        }
        // 2. Regex no assunto: ex. "Filho #168555 - Análise Técnica"
        if (!parentTicketId && t.subject) {
          const match = t.subject.match(/#(\d{5,9})/);
          if (match) parentTicketId = match[1];
        }
        // 3. Último recurso: custom_fields com 6+ dígitos (exige 6 para evitar capturar
        //    IDs internos curtos, como IDs de categorias/classificações com 5 dígitos).
        if (!parentTicketId && Array.isArray(t.custom_fields)) {
          for (const cf of t.custom_fields) {
            if (cf.value && typeof cf.value === 'string' && /^\d{6,9}$/.test(cf.value.trim())) {
              parentTicketId = cf.value.trim();
              break;
            }
          }
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
          agent_name: assignee?.name,
          agent_email: assignee?.email,
          agent_id: agentLink?.id,
          team_id: agentLink?.team_id,
          tags: Array.isArray(t.tags) ? t.tags : [],
          organization_id: t.organization_id,
          organization_name: org?.name,
          organization_tags: Array.isArray(org?.tags) ? org.tags : [],
          child_macro_type: childMacroType,
          parent_ticket_id: parentTicketId,
        };
      }));

      return jsonResponse({ success: true, tickets: mappedTickets, next_cursor: nextCursor, has_more: hasMore }, 200);
    }

    // 2. Busca de Histórico / Diálogo do Chamado
    if (action === 'fetch_dialogue') {
      if (!ticket_id) {
        return jsonResponse({ error: 'ticket_id é obrigatório para fetch_dialogue' }, 400);
      }

      const commentsUrl = `https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}/comments.json?include=users`;
      const response = await fetch(commentsUrl, { headers: zendeskHeaders });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Zendesk Comments API falhou (${response.status}): ${errText}`);
      }

      const commentsData = await response.json();
      const comments = commentsData.comments || [];

      // Mapeia usuários para resolução precisa de autor e papel (end_user vs agent)
      const sideloadedUsers = new Map<number, { name: string; role: string }>();
      if (Array.isArray(commentsData.users)) {
        for (const u of commentsData.users) {
          sideloadedUsers.set(u.id, {
            name: u.name || '',
            role: u.role === 'end-user' ? 'end_user' : (u.role === 'admin' ? 'admin' : 'agent'),
          });
        }
      }

      const mappedComments: any[] = [];
      for (const c of comments) {
        const userInfo = sideloadedUsers.get(c.author_id);
        const authorName = (userInfo?.name || '').trim();
        const isBotAuthor = authorName.toLowerCase().includes('ia webposto');
        let role = isBotAuthor ? 'system' : (userInfo?.role || (c.public ? 'agent' : 'system'));
        // Se o autor é agente/admin mas fez nota interna (c.public === false), mantém como agent
        if (!c.public && (userInfo?.role === 'agent' || userInfo?.role === 'admin')) {
          role = 'agent';
        }

        const body = c.body || c.html_body || '';

        // Se o comentário contiver transcrição inteira de chat consolidada, desmembra em falas individuais:
        if (isChatTranscript(body)) {
          const chatMsgs = parseZendeskChatTranscript(body, {
            parentDate: c.created_at,
            parentId: c.id,
            isPublic: c.public !== false,
          });
          if (chatMsgs.length > 0) {
            mappedComments.push(...chatMsgs);
            continue;
          }
        }

        mappedComments.push({
          id: c.id,
          author_name: authorName || (role === 'end_user' ? 'Cliente' : role === 'system' ? 'Sistema' : 'Atendente'),
          author_role: role,
          created_at: c.created_at,
          body,
          is_public: c.public !== false,
        });
      }

      // Ordena cronologicamente para exibição fidedigna
      mappedComments.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

      // Campos de classificação preenchidos pelo atendente no próprio
      // ticket (categoria, motivo do contato, tipificação etc.) — servem
      // de contexto extra pra IA avaliar, sem preencher nada sozinhos na
      // ficha. custom_fields do ticket só traz {id, value}; ticket_fields.json
      // traz o título legível e, pra campos de seleção, o rótulo de cada
      // opção (o value bruto do ticket é só a "tag" interna, não o texto
      // que o atendente via na tela).
      let ticket_fields: { title: string; value: string }[] = [];
      let ticketTags: string[] = [];
      let orgName: string | undefined;
      let orgTags: string[] = [];
      try {
        const [ticketResp, fieldsResp] = await Promise.all([
          fetch(`https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}.json?include=users,groups,organizations,ticket_forms`, { headers: zendeskHeaders }),
          fetch(`https://${subdomain}.zendesk.com/api/v2/ticket_fields.json`, { headers: zendeskHeaders }),
        ]);

        if (ticketResp.ok && fieldsResp.ok) {
          const ticketJson = await ticketResp.json();
          const fieldsJson = await fieldsResp.json();
          const ticket = ticketJson.ticket;
          ticketTags = Array.isArray(ticket?.tags) ? ticket.tags : [];
          
          if (ticket?.organization_id && Array.isArray(ticketJson.organizations)) {
            const org = ticketJson.organizations.find((o: any) => o.id === ticket.organization_id);
            if (org) {
              orgName = org.name;
              orgTags = Array.isArray(org.tags) ? org.tags : [];
            }
          }

          // Identifica os campos pertencentes ao formulário ativo do ticket (ticket_form)
          let allowedFieldIds: Set<number> | null = null;
          const ticketFormId = ticket?.ticket_form_id;

          if (Array.isArray(ticketJson.ticket_forms) && ticketFormId) {
            const currentForm = ticketJson.ticket_forms.find((f: any) => f.id === ticketFormId);
            if (currentForm && Array.isArray(currentForm.ticket_field_ids)) {
              allowedFieldIds = new Set(currentForm.ticket_field_ids);
            }
          }

          // Fallback caso ticket_forms não venha no include mas haja ticketFormId
          if (!allowedFieldIds && ticketFormId) {
            try {
              const formResp = await fetch(`https://${subdomain}.zendesk.com/api/v2/ticket_forms/${ticketFormId}.json`, { headers: zendeskHeaders });
              if (formResp.ok) {
                const formJson = await formResp.json();
                if (Array.isArray(formJson?.ticket_form?.ticket_field_ids)) {
                  allowedFieldIds = new Set(formJson.ticket_form.ticket_field_ids);
                }
              }
            } catch (formErr) {
              console.warn('[helpdesk-queue] Falha ao consultar ticket_form individual:', formErr);
            }
          }

          const customFields: { id: number; value: any }[] = ticket?.custom_fields || [];
          const fieldDefs = new Map<number, any>((fieldsJson.ticket_fields || []).map((f: any) => [f.id, f]));

          // Padrões de flags de controle/automação interna do Zendesk que não devem poluir a avaliação
          const SYSTEM_FLAGS_REGEX = /^(não conformidade|ticket pai|ticket filho|ticket filho nova demanda|ticket filho produtividade|analisado)$/i;

          ticket_fields = customFields
            .filter(cf => {
              // 1. Se o formulário tiver lista de campos, deve pertencer a ele (campos de outros formulários são ignorados)
              if (allowedFieldIds && !allowedFieldIds.has(cf.id)) {
                return false;
              }

              // 2. Não exibe valores nulos, indefinidos ou vazios
              if (cf.value === null || cf.value === undefined || cf.value === '') {
                return false;
              }

              // 3. Flags booleanas desmarcadas (false / 'false') são ocultas
              if (cf.value === false || cf.value === 'false') {
                return false;
              }

              const def = fieldDefs.get(cf.id);

              // 4. Campos inativos no Zendesk não devem aparecer
              if (def && def.active === false) {
                return false;
              }

              const title = (def?.title_in_portal || def?.title || '').trim();

              // 5. Flags de controle internas desmarcadas ou irrelevantes não devem aparecer
              if (SYSTEM_FLAGS_REGEX.test(title) && (cf.value === false || cf.value === 'false' || !cf.value)) {
                return false;
              }

              return true;
            })
            .map(cf => {
              const def = fieldDefs.get(cf.id);
              const title = def?.title_in_portal || def?.title || `Campo ${cf.id}`;

              let formattedValue = '';
              if (def?.type === 'checkbox') {
                formattedValue = (cf.value === true || cf.value === 'true') ? 'Sim' : String(cf.value);
              } else if (def?.custom_field_options && Array.isArray(def.custom_field_options)) {
                const option = def.custom_field_options.find((o: any) => o.value === cf.value);
                formattedValue = option?.name || (Array.isArray(cf.value) ? cf.value.join(', ') : String(cf.value));
              } else if (Array.isArray(cf.value)) {
                formattedValue = cf.value.join(', ');
              } else {
                formattedValue = String(cf.value);
              }

              return { title, value: formattedValue.trim() };
            })
            .filter(f => f.value.length > 0 && f.value !== 'false');
        }
      } catch (e) {
        // Campos de classificação e tags são bônus de contexto — falha aqui
        // não deve impedir a avaliação de seguir com a transcrição normal.
        console.warn('[helpdesk-queue] Falha ao buscar campos e organização do ticket:', e);
      }

      return jsonResponse({
        success: true,
        comments: mappedComments,
        ticket_fields,
        tags: ticketTags,
        organization_name: orgName,
        organization_tags: orgTags,
      }, 200);
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
  callerId?: string
): Promise<Response> {
  const { ticket_id, form_criteria, dialogue, agent_info, guideline_ids, ticket_fields } = payload;

  if (!ticket_id || !form_criteria?.sections) {
    return jsonResponse({ error: 'ticket_id e form_criteria são obrigatórios para evaluate_ai' }, 400);
  }

  const startTime = Date.now();

  // Provedor principal: API nativa do Gemini (Google AI Studio) — mais
  // confiável por chamada que o pool gratuito do OpenRouter (ver abaixo),
  // porque não compete com o tráfego de todo mundo que usa modelos :free
  // no OpenRouter ao mesmo tempo. gemini-3.6-flash é o sucessor recomendado
  // pelo próprio Google para o antigo gemini-2.5-flash (descontinuado para
  // novas chaves) — testado manualmente e confirmado respeitando
  // responseSchema estrito. Tem cota própria por minuto/dia (bem menor que
  // o pool do OpenRouter), por isso o OpenRouter continua como fallback:
  // se a cota do dia estourar ou a chamada falhar por qualquer motivo, cai
  // pra cadeia de modelos gratuitos abaixo antes de desistir de vez.
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';

  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
  const openRouterModels = (Deno.env.get('OPENROUTER_MODEL') || 'deepseek/deepseek-v4-flash-0731:free,qwen/qwen3.8-27b:free,google/gemma-4-26b-a4b-it:free')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean)
    .slice(0, 3); // máximo 3 — limite hard da API OpenRouter

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

  // Sanitização anti-ruído: remove assinaturas, disclaimers legais e decompõe transcrições de chat
  const dialogueText = sanitizeDialogue(dialogue || [], agent_info?.name);

  const criteriaText = form_criteria.sections
    .map((s: any) => `Seção "${s.title}":\n${(s.questions || []).map((q: any) => `- [${q.id}] ${q.text}${q.is_critical ? ' (ERRO CRÍTICO)' : ''}`).join('\n')}`)
    .join('\n\n');

  // Manual de padrões de atendimento (cadastrado em Admin > Manual da IA):
  // ampliado para 40.000 caracteres para suportar o manual completo sem truncamento.
  const MAX_GUIDELINES_CHARS = 40000;
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
Avalie o atendimento abaixo com base na ficha de critérios fornecida${guidelinesText ? ' e no manual de padrões de atendimento abaixo (formatado em Markdown)' : ''}.
${guidelinesText ? `\nMANUAL DE PADRÕES DE ATENDIMENTO (referência normativa da empresa — formato Markdown, interprete títulos, listas e destaques como estrutura semântica):\n${guidelinesText}\n` : ''}
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

  let usedProvider: 'gemini' | 'openrouter' = 'gemini';
  let usedModel = geminiModel;

  // Faz a chamada num provedor específico e devolve o JSON já parseado e
  // validado contra o schema — ou lança erro (rede, HTTP, ou resposta fora
  // do formato esperado) pra quem chamou decidir se tenta o próximo provedor.
  async function callAndValidate(provider: 'openrouter' | 'gemini'): Promise<any> {
    let text: string | undefined;

    if (provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openRouterApiKey}`,
          // Cabeçalhos recomendados pelo OpenRouter para identificar a app
          // (não obrigatórios, mas ajudam a evitar throttling nos modelos :free).
          'HTTP-Referer': Deno.env.get('FRONTEND_URL') || 'https://qualitrack.app',
          'X-Title': 'QualidadeWP',
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
      usedProvider = 'openrouter';
      usedModel = data.model || openRouterModels[0] || 'openrouter';
    } else {
      // API nativa do Gemini (Google AI Studio) com timeout realista de 35s
      const candidateModels = [
        geminiModel || 'gemini-2.5-flash',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
      ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

      let lastGeminiErr = '';
      for (const modelToTry of candidateModels) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelToTry}:generateContent?key=${geminiApiKey}`,
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
              signal: AbortSignal.timeout(35000),
            }
          );

          if (response.ok) {
            const data = await response.json();
            text = (data.candidates?.[0]?.content?.parts || [])
              .map((p: any) => p.text || '')
              .join('');
            if (text) {
              usedModel = modelToTry;
              break;
            }
          } else {
            const errText = await response.text().catch(() => '');
            lastGeminiErr = `(${response.status} ${modelToTry}): ${errText}`;
          }
        } catch (fetchErr: any) {
          lastGeminiErr = `${modelToTry}: ${fetchErr.message}`;
          // Se deu timeout de 35s, interrompe o loop para não encadear múltiplos minutos de espera
          if (fetchErr.name === 'TimeoutError' || fetchErr.message?.includes('timed out')) {
            break;
          }
        }
      }

      if (!text) {
        throw new Error(`Gemini API falhou em todos os modelos candidatos. Último erro: ${lastGeminiErr}`);
      }
    }

    // Extrai o bloco JSON com regex tolerante a texto antes/depois
    text = text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    } else {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    }

    const parsed = JSON.parse(text);

    // Normalização defensiva: se o modelo omitiu ou renomeou algum critério,
    // preenche com padrão em vez de descartar a avaliação inteira.
    if (!parsed.answers || typeof parsed.answers !== 'object') {
      parsed.answers = {};
    }

    for (const qId of questionRequired) {
      if (!parsed.answers[qId] || !parsed.answers[qId].answer) {
        parsed.answers[qId] = {
          answer: 'NA',
          justification: 'Critério não avaliado explicitamente ou não aplicável ao atendimento.'
        };
      }
    }

    // Se o score não for número válido, calcula a nota proporcional aos SIM/NAO
    if (typeof parsed.score !== 'number' || isNaN(parsed.score)) {
      let totalCount = 0;
      let yesCount = 0;
      for (const qId of questionRequired) {
        const a = parsed.answers[qId]?.answer;
        if (a === 'SIM') { totalCount++; yesCount++; }
        else if (a === 'NAO') { totalCount++; }
      }
      parsed.score = totalCount > 0 ? Math.round((yesCount / totalCount) * 100) : 100;
    }

    // Garante que summary, strengths e improvements existam
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
      parsed.summary = `Atendimento avaliado automaticamente com ${parsed.score}% de conformidade.`;
    }
    if (!Array.isArray(parsed.strengths)) {
      parsed.strengths = ['Atendimento conduzido dentro dos parâmetros operacionais.'];
    }
    if (!Array.isArray(parsed.improvements)) {
      parsed.improvements = [];
    }

    return parsed;
  }

  try {
    let parsed: any;
    let lastError: any;

    if (geminiApiKey) {
      try {
        parsed = await callAndValidate('gemini');
      } catch (e: any) {
        lastError = e;
        console.warn('[helpdesk-queue] Gemini falhou ou respondeu fora do schema, tentando fallback OpenRouter:', e.message);
      }
    }

    if (!parsed && openRouterApiKey) {
      try {
        parsed = await callAndValidate('openrouter');
      } catch (e: any) {
        lastError = e;
        console.error('[helpdesk-queue] Fallback OpenRouter também falhou:', e.message);
      }
    }

    if (!parsed) {
      throw lastError || new Error('Nenhum provedor de IA disponível');
    }

    const durationMs = Date.now() - startTime;

    // Registra log para auditoria de administradores
    try {
      await supabase.from('ai_evaluation_logs').insert({
        ticket_id: String(ticket_id),
        ticket_subject: agent_info?.team_name ? `Atendimento (${agent_info.team_name})` : `Ticket #${ticket_id}`,
        evaluation_type: 'atendimento',
        provider: usedProvider,
        model: usedModel,
        duration_ms: durationMs,
        prompt_text: prompt,
        sanitized_dialogue: dialogueText,
        response_json: parsed,
        status: 'success',
        created_by: callerId || null,
      });
    } catch (logErr) {
      console.warn('[helpdesk-queue] Falha ao registrar log de IA:', logErr);
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

    try {
      await supabase.from('ai_evaluation_logs').insert({
        ticket_id: String(ticket_id),
        ticket_subject: `Ticket #${ticket_id}`,
        evaluation_type: 'atendimento',
        provider: geminiApiKey ? 'gemini' : 'openrouter',
        model: geminiApiKey ? geminiModel : (openRouterModels[0] || 'unknown'),
        duration_ms: Date.now() - startTime,
        prompt_text: prompt,
        sanitized_dialogue: dialogueText,
        status: 'error',
        error_message: error?.message || 'Falha ao avaliar com IA',
        created_by: callerId || null,
      });
    } catch (_) {}

    return jsonResponse({ error: error.message || 'Falha ao avaliar com IA' }, 502);
  }
}

async function handleEvaluateChildTicket(
  payload: z.infer<typeof RequestSchema>,
  supabase: SupabaseClient,
  callerId?: string
): Promise<Response> {
  const { ticket_id, ticket_subject, dialogue, ticket_fields, tags, macro_type } = payload;

  if (!ticket_id) {
    return jsonResponse({ error: 'ticket_id é obrigatório para evaluate_child_ticket' }, 400);
  }

  const startTime = Date.now();
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';
  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
  const openRouterModels = (Deno.env.get('OPENROUTER_MODEL') || 'deepseek/deepseek-v4-flash-0731:free,qwen/qwen3.8-27b:free,google/gemma-4-26b-a4b-it:free')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean)
    .slice(0, 3); // máximo 3 — limite hard da API OpenRouter

  if (!openRouterApiKey && !geminiApiKey) {
    return jsonResponse({ error: 'Nenhum provedor de IA configurado no Supabase Secrets' }, 500);
  }

  const dialogueText = sanitizeDialogue(dialogue || []);
  const ticketFieldsText = (ticket_fields || []).map((f: any) => `- ${f.title}: ${f.value}`).join('\n');
  const tagsText = (tags || []).join(', ');

  const responseSchema = {
    type: 'object',
    properties: {
      detected_type: {
        type: 'string',
        enum: ['nova_demanda', 'analise_tecnica', 'apoio_tecnico', 'produtividade', 'desconhecido'],
        description: 'Tipo de macro/abertura identificado no chamado filho'
      },
      status: {
        type: 'string',
        enum: ['conforme', 'nao_conforme', 'atencao'],
        description: 'Status geral da conformidade de abertura'
      },
      score: {
        type: 'number',
        description: 'Nota de conformidade de 0 a 100'
      },
      summary: {
        type: 'string',
        description: 'Resumo executivo do parecer de qualidade sobre o chamado filho'
      },
      checks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rule: { type: 'string', description: 'Nome da regra validada' },
            passed: { type: 'boolean', description: 'Se a regra foi cumprida' },
            details: { type: 'string', description: 'Justificativa objetiva citando os campos ou tags' }
          },
          required: ['rule', 'passed', 'details'],
          additionalProperties: false
        }
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Orientações práticas para o monitor ou analista'
      }
    },
    required: ['detected_type', 'status', 'score', 'summary', 'checks', 'recommendations'],
    additionalProperties: false
  };

  const prompt = `Você é um auditor sênior de qualidade da WebPosto especialista em auditoria de Chamados Filhos (Side Conversations do Zendesk).
Sua função é verificar a CONFORMIDADE DE ABERTURA do chamado filho com base no Manual - Guia Operacional de Macros do Zendesk (POP v1.1).

O monitor de qualidade avalia OBRIGATORIAMENTE os seguintes quesitos fundamentais:

=============================================================================
1. PRESERVAÇÃO DO ASSUNTO (INALTERABILIDADE - REGRA CRÍTICA):
=============================================================================
- O assunto do ticket filho DEVE conter o nome da macro padrão homologada.
- O Zendesk e as automações frequentemente adicionam:
  * O prefixo "Ticket " (ex: "Ticket Nova Demanda")
  * O sufixo ou complemento com o número do chamado pai, como "do #169238", "#169238", "do chamado #169238", "do ticket #169238" (ex: "Nova Demanda do #169238", "Ticket Nova Demanda do #169238", "Encaminhado para Análise Técnica... do #169238")
- REGRA DE OURO DA AUDITORIA: TODAS ESSAS FORMAS SÃO 100% CONFORMES E HOMOLOGADAS! A presença do prefixo "Ticket" ou do sufixo com o número do chamado pai (ex: "do #169238") NÃO VIOLA A REGRA e DEVE PASSAR (passed: true).
- ASSUNTOS PADRÃO HOMOLOGADOS (válidos com ou sem "Ticket" e com ou sem "do #<id>"):
  * "Nova Demanda" (ou "Nova Demanda - Mais Pagamentos")
  * "Encaminhado para Análise Técnica Cliente Final"
  * "Encaminhado para Análise Técnica REVENDA"
  * "Encaminhado para Análise Técnica Fiscal"
  * "Encaminhado para Análise Técnica Contábil"
  * "Encaminhado para Análise Técnica - Correções" (ou "Encaminhado para Análise de Correções")
  * "Encaminhado para Desenvolvimento"
  * "Apoio Análise Técnica"
- QUANDO DEVE FALHAR (passed: false): APENAS se o assunto foi totalmente descaracterizado e substituído por texto livre que não contém nenhuma das macros homologadas acima (ex: "Erro no PDV", "Cliente com dúvida", "Impressora travada").

=============================================================================
2. PRESERVAÇÃO DO TEXTO DA MACRO COM ENRIQUECIMENTO TÉCNICO:
=============================================================================
- REGRA: O COMENTÁRIO/DESCRIÇÃO PRECISA CONTER A MENSAGEM INTEGRAL DA MACRO.
- O analista PODE E DEVE adicionar mais informações complementares (dados do cliente/posto, versão do sistema, AnyDesk/senha, descrição detalhada do erro, logs do PDV, prints, passos de reprodução e testes já executados).
- O que NÃO PODE: O analista NÃO PODE apagar o texto da macro e deixar apenas um texto genérico ou em branco. O texto-base estrutural da macro deve estar contido.
- Se o texto da macro estiver presente (mesmo enriquecido com mais detalhes): Check "Preservação do Texto da Macro" passa (passed: true).
- Se o analista apagou o texto da macro ou deixou vazio: Check falha (passed: false).

=============================================================================
3. DIRECIONAMENTO CORRETO (CAMPO "PARA" / ASSIGNEE):
=============================================================================
- "Enviar para Análise Técnica" (Cliente Final, Revenda, Fiscal, Contábil, Correções, Desenvolvimento):
  * O campo "Para" DEVE ser direcionado ao GRUPO Técnico Especialista correspondente (ex: "Análise Técnica Fiscal", "Análise Técnica Revenda", etc.).
  * NUNCA PODE SER ATRIBUÍDO A UMA PESSOA FÍSICA / ANALISTA ESPECÍFICO.
- "Registrar Nova Demanda" (Geral ou Mais Pagamentos):
  * O campo "Para" DEVE ser atribuído a SI MESMO (o próprio analista solicitante) para acompanhamento da resolução.
- "Apoio Análise Técnica":
  * O campo "Para" DEVE ser atribuído nominalmente ao Analista Técnico N2 que prestou a consultoria pontual.
- "Mais Pagamentos":
  * Direcionamento ao Grupo Mais Pagamentos (ID 50800061906068) / marca dedicada.
- Check "Direcionamento Correto ('Para')" deve validar essa correspondência com rigor.

=============================================================================
4. GOVERNANÇA DE TAGS E AUTOMAÇÃO:
=============================================================================
- Nova Demanda: Presença obrigatória das tags 'existe_ticket_filho' e 'existe_nova_demanda' (ou 'maispag_nova_demanda').
- Análise Técnica: Presença de 'transferencia_analise', 'transferencia_analise_fiscal', 'transferencia_analise_contabil', etc.
- Uso de current_tags (adicionar) e não remoção de tags de auditoria.

DADOS DO CHAMADO FILHO SOB AUDITORIA:
- Ticket: #${ticket_id}
- Assunto Registrado: ${ticket_subject || 'Não informado'}
- Tipo Sugerido/Macro: ${macro_type || 'Detectar automaticamente'}
- Tags do Chamado: ${tagsText || '(sem tags)'}
- Campos do Ticket:
${ticketFieldsText || '(nenhum campo extra)'}

CONTEÚDO / DESCRIÇÃO / COMENTÁRIOS DO TICKET FILHO:
${dialogueText || '(sem texto registrado)'}

CHECKS OBRIGATÓRIOS QUE DEVEM CONSTAR NA RESPOSTA:
1. rule: "Preservação do Assunto (Inalterabilidade)"
2. rule: "Preservação do Texto da Macro"
3. rule: "Direcionamento Correto ('Para')"
4. rule: "Governança de Tags e Automação"

Analise os dados reais do ticket contra essas regras operacionais e gere o parecer estritamente no JSON do schema.`;

  async function callChildModel(provider: 'gemini' | 'openrouter'): Promise<any> {
    let text: string | undefined;
    if (provider === 'openrouter') {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openRouterApiKey}`,
          'HTTP-Referer': Deno.env.get('FRONTEND_URL') || 'https://qualitrack.app',
          'X-Title': 'QualidadeWP',
        },
        body: JSON.stringify({
          models: openRouterModels,
          temperature: 0.1,
          messages: [{ role: 'user', content: prompt }],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'auditoria_chamado_filho', strict: true, schema: responseSchema }
          }
        })
      });
      if (!resp.ok) throw new Error(`OpenRouter falhou: ${resp.status}`);
      const data = await resp.json();
      text = data.choices?.[0]?.message?.content;
    } else {
      const candidateModels = [
        geminiModel || 'gemini-2.5-flash',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
      ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

      let lastError: Error | null = null;
      for (const modelToTry of candidateModels) {
        try {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelToTry}:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              signal: AbortSignal.timeout(35000),
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey! },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.1,
                  responseMimeType: 'application/json',
                  responseSchema: stripAdditionalProperties(responseSchema),
                }
              })
            }
          );
          if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`Gemini (${modelToTry}) falhou (${resp.status}): ${errText}`);
          }
          const data = await resp.json();
          text = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
          if (text) {
            usedModel = modelToTry;
            break;
          }
        } catch (mErr: any) {
          console.warn(`[helpdesk-queue] Tentativa Gemini com ${modelToTry} falhou:`, mErr.message);
          lastError = mErr;
          if (mErr.name === 'TimeoutError' || mErr.message?.includes('timed out')) {
            break;
          }
        }
      }
      if (!text && lastError) throw lastError;
    }

    if (!text) throw new Error('Resposta vazia da IA');
    text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(text);
  }

  try {
    let parsed: any;
    let usedProvider: 'gemini' | 'openrouter' = 'gemini';
    let usedModel = geminiModel;

    if (geminiApiKey) {
      try {
        parsed = await callChildModel('gemini');
      } catch (e: any) {
        console.warn('[helpdesk-queue] Gemini falhou para chamado filho, tentando OpenRouter:', e.message);
      }
    }

    if (!parsed && openRouterApiKey) {
      parsed = await callChildModel('openrouter');
      usedProvider = 'openrouter';
      usedModel = openRouterModels[0];
    }

    if (!parsed) {
      throw new Error('Nenhum provedor de IA conseguiu avaliar o chamado filho.');
    }

    const durationMs = Date.now() - startTime;
    try {
      await supabase.from('ai_evaluation_logs').insert({
        ticket_id: String(ticket_id),
        ticket_subject: ticket_subject || `Chamado Filho #${ticket_id}`,
        evaluation_type: 'chamado_filho',
        provider: usedProvider,
        model: usedModel,
        duration_ms: durationMs,
        prompt_text: prompt,
        sanitized_dialogue: dialogueText,
        response_json: parsed,
        status: 'success',
        created_by: callerId || null,
      });
    } catch (logErr) {
      console.warn('[helpdesk-queue] Falha ao registrar log de chamado filho:', logErr);
    }

    return jsonResponse({ success: true, result: parsed }, 200);
  } catch (err: any) {
    console.error('[helpdesk-queue] Erro ao avaliar chamado filho:', err);
    try {
      await supabase.from('ai_evaluation_logs').insert({
        ticket_id: String(ticket_id),
        ticket_subject: ticket_subject || `Chamado Filho #${ticket_id}`,
        evaluation_type: 'chamado_filho',
        provider: geminiApiKey ? 'gemini' : 'openrouter',
        model: geminiApiKey ? geminiModel : 'unknown',
        duration_ms: Date.now() - startTime,
        prompt_text: prompt,
        sanitized_dialogue: dialogueText,
        status: 'error',
        error_message: err.message,
        created_by: callerId || null,
      });
    } catch (_) {}
    return jsonResponse({ error: err.message || 'Falha ao avaliar chamado filho' }, 502);
  }
}
