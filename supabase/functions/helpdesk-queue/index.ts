import { publicApiKey, secretApiKey } from '../_shared/keys.ts';
import { corsFor, rejectRequest, configuredOrigin } from '../_shared/http.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  sanitizeDialogue, sanitizeMessageBody, isChatTranscript, parseZendeskChatTranscript,
  buildZendeskParticipantRoles, normalizeTranscriptSpeakerName, zendeskParticipantRole, classifyTranscriptMessage,
} from './sanitizer.ts';
import {
  AIModelError,
  incompleteResponse,
  parseModelJSON,
  runAIModelChain,
  type AIAttemptRecord,
  type AIModelTarget,
} from './ai-fallback.ts';
import { callOpenRouter, OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODEL } from './openrouter-client.ts';
import { retryAt } from './ai-retry.ts';
import { canReadQueueTicket, trustedZendeskCursor, type QueueType } from './access.ts';

const corsHeaders = corsFor(Deno.env.get('FRONTEND_URL'));
const AI_PRIMARY_TIMEOUT_MS = Math.min(120_000, Math.max(1_000, Number(Deno.env.get('AI_PRIMARY_TIMEOUT_MS') || '30000') || 30000));
const AI_TARGETS: AIModelTarget[] = [
  { provider: 'openrouter', model: OPENROUTER_MODEL, maxAttempts: 4, timeoutMs: AI_PRIMARY_TIMEOUT_MS },
  { provider: 'openrouter', model: OPENROUTER_FALLBACK_MODEL, maxAttempts: 3, timeoutMs: 45_000 },
];


const MAX_REQUEST_BYTES = 1_000_000;

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
    'cancel_ai_evaluation',
    'resolve_agent',
    'lookup_ticket_agent',
    'sync_zendesk_groups',
    'backfill_agent_team'
  ]),
  queue_type: z.enum(['negativas', 'proativas', 'positivas', 'filhos', 'filhos_invalidos']).optional(),
  ticket_id: z.string().optional(),
  job_id: z.string().uuid().optional(),
  draft_meta: z.object({
    form_id: z.string().uuid().nullable().optional(),
    agent_name: z.string().nullable().optional(),
    agent_email: z.string().nullable().optional(),
    agent_id: z.string().uuid().nullable().optional(),
    team_id: z.string().uuid().nullable().optional(),
    channel: z.string().nullable().optional(),
    satisfaction_comment: z.string().nullable().optional(),
    guideline_ids: z.array(z.string().uuid()).optional(),
  }).optional(),
  ticket_subject: z.string().max(500).optional(),
  // Cursor de paginação — vem de um `next_cursor` de uma resposta anterior
  // de fetch_queue. Ausente/null = primeira página.
  cursor: z.string().max(2000).nullable().optional(),
  form_criteria: z.object({ sections: z.array(z.object({
    title: z.string().max(300),
    questions: z.array(z.object({
      id: z.string().max(100), text: z.string().max(2000), is_critical: z.boolean().optional(),
    }).passthrough()).max(200),
  }).passthrough()).max(50) }).passthrough().optional(),
  dialogue: z.array(z.record(z.unknown())).max(500).optional(),
  dialogue_text: z.string().max(250_000).optional(),
  agent_info: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    team_name: z.string().optional(),
    channel: z.string().optional(),
  }).optional(),
  guideline_ids: z.array(z.string().uuid()).max(50).optional(),
  ticket_fields: z.array(z.object({ title: z.string().max(300), value: z.string().max(4000) })).max(100).optional(),
  tags: z.array(z.string().max(150)).max(100).optional(),
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
    if (Number(req.headers.get('content-length') || 0) > MAX_REQUEST_BYTES)
      return jsonResponse({ error: 'Payload muito grande.' }, 413);
    const rawText = await req.text();
    if (new TextEncoder().encode(rawText).length > MAX_REQUEST_BYTES)
      return jsonResponse({ error: 'Payload muito grande.' }, 413);
    const workerBody = (() => { try { return JSON.parse(rawText); } catch { return null; } })();
    if (workerBody?.action === 'process_ai_retries') {
      if (req.headers.get('apikey') !== secretApiKey()) {
        return jsonResponse({ error: 'Worker não autorizado.' }, 403);
      }
      const workerClient = createClient(Deno.env.get('SUPABASE_URL')!, secretApiKey());
      return await processAIRetries(workerClient);
    }
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

    const parseResult = RequestSchema.safeParse(workerBody || {});

    if (!parseResult.success) {
      return jsonResponse({ error: 'Payload inválido', details: parseResult.error.flatten() }, 400);
    }

    const { action, queue_type, ticket_id } = parseResult.data;

    // Rate limit geral: 60 requisições/minuto por usuário, cobre toda action.
    const general = await supabase.rpc('consume_security_rate_limit', {
      bucket_key: `helpdesk-queue:general:${user.id}`, max_requests: 60, window_seconds: 60,
    });
    if (general.error) return jsonResponse({ error: 'Limite de requisições indisponível.' }, 503);
    if (!general.data) {
      return jsonResponse({ error: 'Muitas requisições em pouco tempo. Aguarde um momento e tente de novo.' }, 429);
    }

    // Rate limit apertado só para evaluate_ai: chama a IA (custo real) e
    // indiretamente consome a cota diária do token do Zendesk (via
    // fetch_dialogue, chamado antes pelo frontend). 10 avaliações a cada 5
    // minutos é folgado para revisão manual normal, mas barra um loop/script.
    if (action === 'evaluate_ai' || action === 'evaluate_child_ticket') {
      const ai = await supabase.rpc('consume_security_rate_limit', {
        bucket_key: `helpdesk-queue:ai:${user.id}`, max_requests: 10, window_seconds: 300,
      });
      if (ai.error) return jsonResponse({ error: 'Limite de avaliações indisponível.' }, 503);
      if (!ai.data) {
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

    if (action === 'cancel_ai_evaluation') {
      if (!parseResult.data.job_id) return jsonResponse({ error: 'Job de IA obrigatório.' }, 400);
      const { data: cancelled, error } = await supabase.rpc('cancel_ai_evaluation_job', { p_job_id: parseResult.data.job_id });
      if (error) return jsonResponse({ error: 'Cancelamento não autorizado ou indisponível.' }, 403);
      return jsonResponse({ cancelled: Boolean(cancelled), job_id: parseResult.data.job_id }, 200);
    }

    if (action === 'evaluate_ai' || action === 'evaluate_child_ticket') {
      if (!parseResult.data.job_id) return jsonResponse({ error: 'Job de IA obrigatório.' }, 400);
      if (action === 'evaluate_ai' && !parseResult.data.draft_meta) {
        return jsonResponse({ error: 'Metadados do rascunho obrigatórios.' }, 400);
      }
      const { data: started, error: startError } = await supabase.rpc('begin_ai_evaluation_execution', {
        p_job_id: parseResult.data.job_id,
        p_caller_id: user.id,
      });
      if (startError) return jsonResponse({ error: startError.message }, 500);
      if (!started) return jsonResponse({ error: 'Este job de IA já está em execução ou não pertence ao usuário.' }, 409);
    }

    // 3. Avaliação com IA: GLM pago primeiro, Gemini pago somente após esgotar GLM.
    if (action === 'evaluate_ai') {
      return await executeAndPersistAIJob(parseResult.data, supabase, user.id,
        signal => handleEvaluateAI(parseResult.data, supabase, user.id, signal));
    }

    if (action === 'evaluate_child_ticket') {
      return await executeAndPersistAIJob(parseResult.data, supabase, user.id,
        signal => handleEvaluateChildTicket(parseResult.data, supabase, user.id, signal));
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
      if (caller.role === 'qualidade') {
        const { data: evidence, error: evidenceError } = await supabase.from('monitorias')
          .select('id').eq('evaluator_id', user.id).eq('evaluated_id', evaluated_id)
          .eq('team_id', backfillTeamId).eq('active', true).limit(1);
        if (evidenceError || !evidence?.length) {
          return jsonResponse({ error: 'Vínculo de equipe não confirmado por monitoria salva.' }, 403);
        }
      } else if (caller.role !== 'admin' && caller.role !== 'gestor_qualidade') {
        return jsonResponse({ error: 'Sem permissão para alterar vínculo de equipe.' }, 403);
      }
      const { data: agent, error: agentError } = await supabase
        .from('users')
        .select('id, role, primary_team_id')
        .eq('id', evaluated_id)
        .maybeSingle();
      if (agentError || !agent) {
        return jsonResponse({ error: 'Agente não encontrado' }, 404);
      }
      if (agent.role !== 'suporte') return jsonResponse({ error: 'Vínculo permitido somente para atendente.' }, 403);
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

    const hasVerifiedTicketAccess = async (requestedId: string): Promise<boolean> => {
      if (caller.role === 'admin' || caller.role === 'gestor_qualidade') return true;
      const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
      const [{ data: direct, error: directError }, { data: children, error: childrenError }] = await Promise.all([
        supabase.from('queue_ticket_catalog').select('ticket_id,queue_type')
          .eq('ticket_id', requestedId).gte('verified_at', cutoff),
        supabase.from('queue_ticket_catalog').select('ticket_id,queue_type')
          .eq('parent_ticket_id', requestedId).eq('queue_type', 'filhos').gte('verified_at', cutoff),
      ]);
      if (directError || childrenError) throw new Error('Falha ao verificar o catálogo da fila.');
      const candidates = [...(direct || []), ...(children || [])];
      const distributed = candidates.filter(c => c.queue_type === 'negativas' || c.queue_type === 'filhos');
      const { data: assignments, error: assignmentsError } = distributed.length > 0
        ? await supabase.from('queue_ticket_assignments').select('ticket_id,queue_type,assigned_to')
          .in('ticket_id', [...new Set(distributed.map(c => c.ticket_id))])
        : { data: [], error: null };
      if (assignmentsError) throw new Error('Falha ao verificar responsável pelo ticket.');
      return candidates.some(c => {
        const owner = (assignments || []).find(a => a.ticket_id === c.ticket_id && a.queue_type === c.queue_type)?.assigned_to || null;
        return canReadQueueTicket(caller.role as string, user.id, c.queue_type as QueueType, owner);
      });
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
        throw new Error(`Zendesk Groups API falhou (${groupsResp.status}).`);
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
      if (!queue_type) return jsonResponse({ error: 'Fila obrigatória.' }, 400);
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
        let trustedCursor: string | null;
        try { trustedCursor = trustedZendeskCursor(parseResult.data.cursor, subdomain,
          `/api/v2/views/${viewId}/tickets.json`); }
        catch { return jsonResponse({ error: 'Cursor de paginação inválido.' }, 400); }
        const url = trustedCursor
          || `https://${subdomain}.zendesk.com/api/v2/views/${viewId}/tickets.json?include=users,groups,organizations&page[size]=${PAGE_SIZE}`;

        const response = await fetch(url, { headers: zendeskHeaders });
        if (!response.ok) {
          throw new Error(`Zendesk Views API falhou (${response.status}).`);
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
        let trustedCursor: string | null;
        try { trustedCursor = trustedZendeskCursor(parseResult.data.cursor, subdomain,
          '/api/v2/search.json', searchQuery); }
        catch { return jsonResponse({ error: 'Cursor de paginação inválido.' }, 400); }
        const url = trustedCursor
          || `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(searchQuery)}&sort_by=created_at&sort_order=desc&include=users,groups,organizations&page[size]=${PAGE_SIZE}`;
        const response = await fetch(url, { headers: zendeskHeaders });

        if (!response.ok) {
          throw new Error(`Zendesk Search API falhou (${response.status}).`);
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
          ticket_date: t.created_at || null,
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

      const { data: auditedRows, error: auditedError } = mappedTickets.length > 0
        ? await supabase.from('monitorias').select('ticket_id')
          .in('ticket_id', mappedTickets.map(t => t.ticket_id))
        : { data: [], error: null };
      if (auditedError) throw new Error('Falha ao verificar tickets já avaliados.');
      const auditedIds = new Set((auditedRows || []).map(row => row.ticket_id));
      const queueTickets = mappedTickets.filter(t => !auditedIds.has(t.ticket_id));

      if (queueTickets.length > 0) {
        const { error: catalogError } = await supabase.from('queue_ticket_catalog').upsert(
          queueTickets.map(t => ({
            ticket_id: t.ticket_id,
            queue_type,
            parent_ticket_id: t.parent_ticket_id || null,
            verified_at: new Date().toISOString(),
          })), { onConflict: 'ticket_id,queue_type' },
        );
        if (catalogError) throw new Error(`Falha no catálogo da fila: ${catalogError.message}`);
      }

      let visibleTickets = queueTickets;
      if ((queue_type === 'negativas' || queue_type === 'filhos') && queueTickets.length > 0) {
        const { error: assignmentError } = await supabase.rpc('assign_queue_tickets', {
          p_tickets: queueTickets.map(t => ({ ticket_id: t.ticket_id, queue_type })),
        });
        if (assignmentError) throw new Error(`Falha na distribuição: ${assignmentError.message}`);
        if (caller.role === 'qualidade') {
          const { data: owned, error: ownedError } = await supabase.from('queue_ticket_assignments')
            .select('ticket_id').eq('queue_type', queue_type).eq('assigned_to', user.id)
            .in('ticket_id', queueTickets.map(t => t.ticket_id));
          if (ownedError) throw new Error(`Falha na autorização da fila: ${ownedError.message}`);
          const ownedIds = new Set((owned || []).map(row => row.ticket_id));
          visibleTickets = queueTickets.filter(t => ownedIds.has(t.ticket_id));
        }
      }

      return jsonResponse({ success: true, tickets: visibleTickets, next_cursor: nextCursor, has_more: hasMore }, 200);
    }

    // 2. Busca de Histórico / Diálogo do Chamado
    if (action === 'fetch_dialogue') {
      if (!ticket_id) {
        return jsonResponse({ error: 'ticket_id é obrigatório para fetch_dialogue' }, 400);
      }

      // Recheck ownership at read time, so a transfer immediately revokes
      // access to both the child and its server-verified parent conversation.
      if (!await hasVerifiedTicketAccess(ticket_id))
        return jsonResponse({ error: 'Ticket não atribuído ou fora da fila autorizada.' }, 403);

      const commentsUrl = `https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}/comments.json?include=users`;
      // Snapshot transitório: dados originais do ticket + autores dos comentários.
      // Não é gravado nem enviado à IA; só os campos necessários seguem adiante.
      const [response, ticketResp] = await Promise.all([
        fetch(commentsUrl, { headers: zendeskHeaders }),
        fetch(`https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}.json?include=users,groups,organizations,ticket_forms`, { headers: zendeskHeaders }),
      ]);

      if (!response.ok) {
        throw new Error(`Zendesk Comments API falhou (${response.status}).`);
      }

      const commentsData = await response.json();
      const comments = commentsData.comments || [];
      const ticketJson = ticketResp.ok ? await ticketResp.json() : null;
      const ticketSnapshot = ticketJson?.ticket || null;

      // Autor de comentário comum: role ligado ao author_id, nunca deduzido
      // pelo nome ou pelo fato de o comentário ser público.
      const sideloadedUsers = new Map<number, { name: string; role: string }>();
      for (const source of [commentsData.users, ticketJson?.users]) {
        if (!Array.isArray(source)) continue;
        for (const u of source) {
          sideloadedUsers.set(u.id, {
            name: u.name || '',
            role: zendeskParticipantRole(u.role) || 'unknown',
          });
        }
      }

      const transcriptComments = comments.filter((comment: any) => isChatTranscript(comment.body || comment.html_body || ''));
      const participantRecords: Array<{ name: string; role: string }> = [...sideloadedUsers.values()];
      if (transcriptComments.length > 0) {
        // A Conversation Log traz o tipo do autor em mensagens nativas de
        // Messaging; em transcrições legadas, complementamos com Users Search.
        try {
          const logResp = await fetch(`https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}/conversation_log`, {
            headers: zendeskHeaders, signal: AbortSignal.timeout(8000),
          });
          if (logResp.ok) {
            const log = await logResp.json();
            for (const event of log.events || []) {
              if (event.author?.display_name && event.author?.type) {
                participantRecords.push({ name: event.author.display_name, role: event.author.type });
              }
            }
          }
        } catch {
          console.warn('[helpdesk-queue] Conversation Log indisponível para identificação dos participantes.');
        }

        const foundSpeakers = new Set<string>();
        for (const comment of transcriptComments) {
          const parsed = parseZendeskChatTranscript(comment.body || comment.html_body || '', {
            parentDate: comment.created_at, parentId: comment.id, isPublic: comment.public !== false,
          });
          for (const message of parsed) {
            const normalized = normalizeTranscriptSpeakerName(message.author_name);
            if (normalized) foundSpeakers.add(normalized);
          }
        }
        const knownRoles = buildZendeskParticipantRoles(participantRecords);
        await Promise.all([...foundSpeakers].filter(name => !knownRoles.get(name)).map(async name => {
          try {
            const searchResp = await fetch(
              `https://${subdomain}.zendesk.com/api/v2/users/search.json?query=${encodeURIComponent(name)}&per_page=100`,
              { headers: zendeskHeaders, signal: AbortSignal.timeout(8000) },
            );
            if (!searchResp.ok) return;
            const search = await searchResp.json();
            for (const candidate of search.users || []) {
              if (normalizeTranscriptSpeakerName(candidate.name || '') === name && zendeskParticipantRole(candidate.role)) {
                participantRecords.push({ name: candidate.name, role: candidate.role });
              }
            }
          } catch {
            console.warn('[helpdesk-queue] Falha ao consultar role de participante no Zendesk.');
          }
        }));
      }
      const participantRoles = buildZendeskParticipantRoles(participantRecords);

      const mappedComments: any[] = [];
      for (const c of comments) {
        const userInfo = sideloadedUsers.get(c.author_id);
        const authorName = (userInfo?.name || '').trim();
        const role = userInfo?.role || (c.author_id == null ? 'system' : 'unknown');

        const body = c.body || c.html_body || '';

        // Se o comentário contiver transcrição inteira de chat consolidada, desmembra em falas individuais:
        if (isChatTranscript(body)) {
          const chatMsgs = parseZendeskChatTranscript(body, {
            parentDate: c.created_at,
            parentId: c.id,
            isPublic: c.public !== false,
          });
          if (chatMsgs.length > 0) {
            mappedComments.push(...chatMsgs.map(message => classifyTranscriptMessage(message, participantRoles)));
            continue;
          }
        }

        mappedComments.push({
          id: c.id,
          author_name: authorName || (role === 'end_user' ? 'Cliente' : role === 'system' ? 'Sistema' : role === 'agent' ? 'Atendente' : 'Autor não identificado'),
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
        const fieldsResp = await fetch(`https://${subdomain}.zendesk.com/api/v2/ticket_fields.json`, { headers: zendeskHeaders });

        if (ticketSnapshot && fieldsResp.ok) {
          const fieldsJson = await fieldsResp.json();
          const ticket = ticketSnapshot;
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
      if (!await hasVerifiedTicketAccess(ticket_id))
        return jsonResponse({ error: 'Ticket não atribuído ou fora da fila autorizada.' }, 403);

      const ticketUrl = `https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}.json?include=users,groups`;
      const response = await fetch(ticketUrl, { headers: zendeskHeaders });

      if (response.status === 404) {
        return jsonResponse({ success: true, agent: null }, 200);
      }
      if (!response.ok) {
        throw new Error(`Zendesk Ticket API falhou (${response.status}).`);
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
    console.error('[helpdesk-queue] Erro técnico:', error instanceof Error ? error.message : String(error));
    return jsonResponse({ error: 'Falha ao processar a solicitação. Consulte os logs do serviço.' }, 500);
  }
});

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

function logAIAttempt(
  evaluationType: 'atendimento' | 'chamado_filho',
  ticketId: string,
  jobId: string,
  record: AIAttemptRecord,
): void {
  const details = {
    event: record.status === 'success' ? 'model_succeeded' : 'model_failed',
    evaluation_type: evaluationType,
    ticket_id: ticketId,
    job_id: jobId,
    provider: record.provider,
    routed_provider: record.routedProvider || null,
    router_attempt: record.routerAttempt || null,
    model: record.model,
    attempt: record.attempt,
    reason: record.reason || null,
    http_status: record.httpStatus || null,
    duration_ms: record.durationMs,
    started_at: record.startedAt || null,
    finished_at: record.finishedAt || null,
    request_id: record.requestId || null,
    prompt_tokens: record.promptTokens ?? null,
    completion_tokens: record.completionTokens ?? null,
    cost: record.cost ?? null,
    message: record.message || null,
  };
  const output = `[ai-retry] ${JSON.stringify(details)}`;
  if (record.status === 'failed') console.warn(output);
  else console.info(output);
}

function attemptsFromError(error: unknown): AIAttemptRecord[] {
  const attempts = (error as { attempts?: unknown } | null)?.attempts;
  return Array.isArray(attempts) ? attempts as AIAttemptRecord[] : [];
}

async function enrichGenerationMetadata(record: AIAttemptRecord | undefined): Promise<void> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!record?.requestId || !apiKey) return;
  try {
    const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(record.requestId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return;
    const body = await response.json() as { data?: {
      provider_name?: string; total_cost?: number; tokens_prompt?: number; tokens_completion?: number;
    } };
    record.routedProvider ||= body.data?.provider_name;
    record.cost ??= body.data?.total_cost;
    record.promptTokens ??= body.data?.tokens_prompt;
    record.completionTokens ??= body.data?.tokens_completion;
  } catch {
    // Generation metadata may arrive later; the immutable request ID remains in the log.
  }
}

function validateEvaluationResponse(value: unknown, questionRequired: string[], criticalQuestions: Set<string>): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) incompleteResponse('A resposta não é um objeto JSON.');
  const parsed = value as Record<string, any>;
  if (!parsed.answers || typeof parsed.answers !== 'object' || Array.isArray(parsed.answers)) {
    incompleteResponse('A resposta não contém o objeto answers.');
  }
  for (const questionId of questionRequired) {
    const answer = parsed.answers[questionId];
    if (!answer || !['SIM', 'NAO', 'NA'].includes(answer.answer)) {
      incompleteResponse(`O critério ${questionId} não contém uma resposta válida.`);
    }
    if (typeof answer.justification !== 'string' || !answer.justification.trim()) {
      incompleteResponse(`O critério ${questionId} não contém justificativa.`);
    }
    if (criticalQuestions.has(questionId) && typeof answer.critical_error !== 'boolean') {
      incompleteResponse(`O critério crítico ${questionId} não contém critical_error.`);
    }
  }
  if (!Number.isFinite(parsed.score) || parsed.score < 0 || parsed.score > 100) incompleteResponse('A resposta não contém score válido.');
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) incompleteResponse('A resposta não contém summary válido.');
  if (!Array.isArray(parsed.strengths) || !parsed.strengths.every((item: unknown) => typeof item === 'string')) {
    incompleteResponse('A resposta não contém strengths válido.');
  }
  if (!Array.isArray(parsed.improvements) || !parsed.improvements.every((item: unknown) => typeof item === 'string')) {
    incompleteResponse('A resposta não contém improvements válido.');
  }
  return parsed;
}

function validateChildEvaluationResponse(value: unknown): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) incompleteResponse('O parecer do chamado filho não é um objeto JSON.');
  const parsed = value as Record<string, any>;
  if (!['nova_demanda', 'analise_tecnica', 'apoio_tecnico', 'produtividade', 'desconhecido'].includes(parsed.detected_type)) {
    incompleteResponse('O parecer não contém detected_type válido.');
  }
  if (!['conforme', 'nao_conforme', 'atencao'].includes(parsed.status)) incompleteResponse('O parecer não contém status válido.');
  if (!Number.isFinite(parsed.score) || parsed.score < 0 || parsed.score > 100) incompleteResponse('O parecer não contém score válido.');
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) incompleteResponse('O parecer não contém summary válido.');
  if (!Array.isArray(parsed.checks) || parsed.checks.length < 4 || !parsed.checks.every((check: any) =>
    check && typeof check.rule === 'string' && typeof check.passed === 'boolean' && typeof check.details === 'string')) {
    incompleteResponse('O parecer não contém os quatro checks obrigatórios completos.');
  }
  if (!Array.isArray(parsed.recommendations) || !parsed.recommendations.every((item: unknown) => typeof item === 'string')) {
    incompleteResponse('O parecer não contém recommendations válido.');
  }
  return parsed;
}

function payloadForRetry(payload: z.infer<typeof RequestSchema>): Record<string, unknown> {
  const { dialogue, ...rest } = payload;
  return {
    ...rest,
    dialogue_text: payload.dialogue_text || sanitizeDialogue(dialogue || []),
    ticket_fields: (payload.ticket_fields || []).map((field: { title?: string; value?: string }) => ({
      title: sanitizeMessageBody(field.title || ''),
      value: sanitizeMessageBody(field.value || ''),
    })),
    agent_info: payload.agent_info ? {
      team_name: payload.agent_info.team_name,
      channel: payload.agent_info.channel,
    } : undefined,
  };
}

interface RetryContext { retryCount: number; leaseId: string }

async function cancelledAIJob(supabase: SupabaseClient, jobId: string): Promise<boolean> {
  const { data } = await supabase.from('ai_evaluation_jobs').select('status').eq('job_id', jobId).maybeSingle();
  return data?.status === 'cancelled';
}

async function setAIPhase(supabase: SupabaseClient, jobId: string, phase: 'running_glm' | 'fallback_gemini' | 'retry_pending'): Promise<void> {
  const { data, error } = await supabase.rpc('set_ai_evaluation_phase', { p_job_id: jobId, p_phase: phase });
  if (error) throw new Error('Falha ao atualizar etapa do job de IA.');
  if (!data) throw new AIModelError('Análise interrompida.', 'cancelled', false, 'global');
}

async function executeAndPersistAIJob(
  payload: z.infer<typeof RequestSchema>,
  supabase: SupabaseClient,
  callerId: string,
  evaluate: (signal: AbortSignal) => Promise<Response>,
  retryContext?: RetryContext,
): Promise<Response> {
  const jobId = payload.job_id!;
  let queuePrepared = Boolean(retryContext);
  const controller = new AbortController();
  let checking = false;
  const cancellationPoll = setInterval(async () => {
    if (checking) return;
    checking = true;
    try { if (await cancelledAIJob(supabase, jobId)) controller.abort(); }
    finally { checking = false; }
  }, 1000);
  try {
    if (!retryContext) {
      // Registra antes da chamada externa: se a Edge Function cair, o job
      // permanece recuperável após a janela de segurança de cinco minutos.
      const { error: queueError } = await supabase.from('ai_evaluation_retry_queue').upsert({
        ticket_id: payload.ticket_id,
        job_id: jobId,
        payload: payloadForRetry(payload),
        next_retry_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        retry_count: 0,
        lease_id: null,
        lease_until: null,
      }, { onConflict: 'ticket_id' });
      if (queueError) throw new Error(`Falha ao preparar reprocessamento: ${queueError.message}`);
      queuePrepared = true;
    }
    if (await cancelledAIJob(supabase, jobId)) return jsonResponse({ cancelled: true }, 409);
    const response = await evaluate(controller.signal);
    if (controller.signal.aborted || await cancelledAIJob(supabase, jobId)) return jsonResponse({ cancelled: true }, 409);
    if (!response.ok) {
      const details = await response.clone().json().catch(() => ({}));
      if (details.cancelled) return jsonResponse({ cancelled: true }, 409);
      if (details.retryable === true) {
        const retryCount = (retryContext?.retryCount || 0) + 1;
        let query = supabase.from('ai_evaluation_retry_queue').update({
          retry_count: retryCount,
          next_retry_at: retryAt(retryContext?.retryCount || 0),
          lease_id: null,
          lease_until: null,
          last_error: String(details.error || `HTTP ${response.status}`).slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq('job_id', jobId);
        if (retryContext) query = query.eq('lease_id', retryContext.leaseId);
        const { data: queued, error: queueError } = await query.select('job_id').maybeSingle();
        if (queueError || !queued) throw new Error('Falha ao agendar reprocessamento da avaliação.');
        await setAIPhase(supabase, jobId, 'retry_pending');
        console.warn(`[ai-job] ${JSON.stringify({ job_id: jobId, ticket_id: payload.ticket_id, status: 'pending_retry', retry_count: retryCount })}`);
        return jsonResponse({ queued: true, job_id: jobId, message: 'Avaliação pendente; reprocessamento automático agendado.' }, 202);
      }
      const { error } = await supabase.from('ai_evaluation_jobs')
        .update({ status: 'failed', phase: 'failed', finished_at: new Date().toISOString(), error_message: String(details.error || `HTTP ${response.status}`).slice(0, 500) })
        .eq('job_id', jobId).eq('status', 'running');
      if (error) console.error('[ai-job] Falha ao registrar erro:', error);
      await supabase.from('ai_evaluation_retry_queue').delete().eq('job_id', jobId);
      return response;
    }

    const body = await response.clone().json();
    const result = body?.result;
    if (!result || typeof result !== 'object') throw new Error('A avaliação não retornou um resultado válido.');
    if (payload.action === 'evaluate_ai') {
      result.ticket_fields = (payload.ticket_fields || []).map((field: { title?: string; value?: string }) => ({
        title: sanitizeMessageBody(field.title || ''),
        value: sanitizeMessageBody(field.value || ''),
      }));
      // O diálogo bruto fica no Zendesk; o formulário o busca novamente
      // quando necessário, sem duplicar dados pessoais no rascunho/job.
    }
    const persistStarted = Date.now();
    const { error } = await supabase.rpc('complete_ai_evaluation_execution', {
      p_job_id: jobId,
      p_caller_id: callerId,
      p_result: result,
      p_draft: payload.action === 'evaluate_ai' ? payload.draft_meta : null,
    });
    if (error) throw new Error(`Falha ao persistir avaliação: ${error.message}`);
    console.info(`[ai-timing] ${JSON.stringify({ job_id: jobId, ticket_id: payload.ticket_id, stage: 'database_write', duration_ms: Date.now() - persistStarted })}`);
    const technical = body.technical as {
      model?: string; attempts?: AIAttemptRecord[]; fallbackUsed?: boolean; durationMs?: number;
      evaluationType?: string;
    } | undefined;
    if (technical) {
      await enrichGenerationMetadata(technical.attempts?.at(-1));
      const { error: logError } = await supabase.from('ai_evaluation_logs').insert({
        job_id: jobId,
        ticket_id: payload.ticket_id,
        ticket_subject: `Ticket #${payload.ticket_id}`,
        evaluation_type: technical.evaluationType,
        provider: 'openrouter',
        model: technical.model,
        duration_ms: technical.durationMs,
        status: 'success',
        attempts: technical.attempts || [],
        fallback_used: technical.fallbackUsed || false,
        created_by: callerId,
      });
      if (logError) console.warn('[ai-job] Falha ao registrar metadados técnicos:', logError.message);
    }
    await supabase.from('ai_evaluation_retry_queue').delete().eq('job_id', jobId);
    console.info(`[ai-job] ${JSON.stringify({ job_id: jobId, ticket_id: payload.ticket_id, status: 'completed' })}`);
    return jsonResponse({ success: true, result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (controller.signal.aborted || await cancelledAIJob(supabase, jobId)) return jsonResponse({ cancelled: true }, 409);
    if (queuePrepared) {
      // Uma falha de persistência/worker não pode descartar o payload durável.
      // A lease expira e o cron recupera o mesmo job sem criar outro.
      console.error(`[ai-job] ${JSON.stringify({ job_id: jobId, ticket_id: payload.ticket_id, status: 'pending_retry', reason: message })}`);
      return jsonResponse({ queued: true, job_id: jobId, message: 'Avaliação pendente; reprocessamento automático agendado.' }, 202);
    }
    const { error: updateError } = await supabase.from('ai_evaluation_jobs')
      .update({ status: 'failed', phase: 'failed', finished_at: new Date().toISOString(), error_message: message.slice(0, 500) })
      .eq('job_id', jobId).eq('status', 'running');
    if (updateError) console.error('[ai-job] Falha ao registrar erro:', updateError);
    console.error(`[ai-job] ${JSON.stringify({ job_id: jobId, ticket_id: payload.ticket_id, status: 'failed', reason: message })}`);
    return jsonResponse({ error: message }, 500);
  } finally {
    clearInterval(cancellationPoll);
    if (controller.signal.aborted || await cancelledAIJob(supabase, jobId)) {
      const { error } = await supabase.rpc('acknowledge_ai_evaluation_cancellation', { p_job_id: jobId });
      if (error) console.error('[ai-job] Falha ao confirmar interrupção:', error.message);
    }
  }
}

async function processAIRetries(supabase: SupabaseClient): Promise<Response> {
  const { data: due, error: claimError } = await supabase.rpc('claim_due_ai_evaluation_retries', { p_limit: 1 });
  if (claimError) return jsonResponse({ error: 'Falha ao obter a fila de reprocessamento.' }, 500);
  const item = (due || [])[0] as {
    ticket_id: string; job_id: string; payload: unknown; retry_count: number; lease_id: string;
  } | undefined;
  if (!item) return jsonResponse({ processed: 0 }, 200);

  const parsed = RequestSchema.safeParse(item.payload);
  const payload = parsed.success ? parsed.data : null;
  if (!payload || !['evaluate_ai', 'evaluate_child_ticket'].includes(payload.action)
    || payload.job_id !== item.job_id || payload.ticket_id !== item.ticket_id) {
    await supabase.from('ai_evaluation_jobs').update({ status: 'failed', phase: 'failed', finished_at: new Date().toISOString(), error_message: 'Payload de retry inválido.' })
      .eq('job_id', item.job_id).eq('status', 'running');
    await supabase.from('ai_evaluation_retry_queue').delete().eq('job_id', item.job_id);
    return jsonResponse({ processed: 1, status: 'invalid_payload' }, 200);
  }
  const { data: job, error: jobError } = await supabase.from('ai_evaluation_jobs')
    .select('started_by, status').eq('job_id', item.job_id).maybeSingle();
  if (jobError || !job || job.status !== 'running') {
    await supabase.from('ai_evaluation_retry_queue').delete().eq('job_id', item.job_id);
    return jsonResponse({ processed: 0 }, 200);
  }
  const evaluate = payload.action === 'evaluate_ai'
    ? (signal: AbortSignal) => handleEvaluateAI(payload, supabase, job.started_by, signal)
    : (signal: AbortSignal) => handleEvaluateChildTicket(payload, supabase, job.started_by, signal);
  const result = await executeAndPersistAIJob(payload, supabase, job.started_by, evaluate, {
    retryCount: item.retry_count,
    leaseId: item.lease_id,
  });
  return jsonResponse({ processed: 1, queued: result.status === 202, status: result.status }, 200);
}

async function handleEvaluateAI(
  payload: z.infer<typeof RequestSchema>,
  supabase: SupabaseClient,
  callerId?: string,
  signal?: AbortSignal,
): Promise<Response> {
  const { ticket_id, form_criteria, dialogue, agent_info, guideline_ids, ticket_fields } = payload;

  if (!ticket_id || !form_criteria?.sections) {
    return jsonResponse({ error: 'ticket_id e form_criteria são obrigatórios para evaluate_ai' }, 400);
  }

  const startTime = Date.now();

  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!openRouterApiKey) {
    return jsonResponse({ error: 'OPENROUTER_API_KEY não configurada no Supabase Secrets' }, 500);
  }

  // Monta o JSON Schema dinamicamente a partir das perguntas da ficha,
  // garantindo que a IA responda nota/justificativa para cada critério.
  const questionProperties: Record<string, any> = {};
  const questionRequired: string[] = [];
  const criticalQuestions = new Set<string>();

  for (const section of form_criteria.sections) {
    for (const q of section.questions || []) {
      const props: Record<string, any> = {
        answer: { type: 'string', enum: ['SIM', 'NAO', 'NA'] },
        justification: { type: 'string', description: 'Justificativa citando trecho literal do diálogo.' },
      };
      const required = ['answer', 'justification'];
      if (q.is_critical) {
        criticalQuestions.add(q.id);
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
  const dialogueText = payload.dialogue_text || sanitizeDialogue(dialogue || []);

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
    .map(f => `- ${sanitizeMessageBody(f.title)}: ${sanitizeMessageBody(f.value)}`)
    .join('\n');

  const prompt = `Você é um analista sênior de qualidade de atendimento ao cliente da WebPosto.
Avalie o atendimento abaixo com base na ficha de critérios fornecida${guidelinesText ? ' e no manual de padrões de atendimento abaixo (formatado em Markdown)' : ''}.
${guidelinesText ? `\nMANUAL DE PADRÕES DE ATENDIMENTO (referência normativa da empresa — formato Markdown, interprete títulos, listas e destaques como estrutura semântica):\n${guidelinesText}\n` : ''}
DADOS DO ATENDIMENTO:
- Atendente: profissional responsável pelo atendimento
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

  const aiTargets = AI_TARGETS;
  const preparationMs = Date.now() - startTime;
  let pipelineAttempts: AIAttemptRecord[] = [];
  console.info(`[ai-retry] ${JSON.stringify({
    event: 'pipeline_started', evaluation_type: 'atendimento', ticket_id: String(ticket_id), job_id: payload.job_id,
    preparation_ms: preparationMs,
    chain: aiTargets.map(target => ({ provider: target.provider, model: target.model, max_attempts: target.maxAttempts })),
  })}`);

  try {
    const chain = await runAIModelChain({
      targets: aiTargets,
      signal,
      onTargetStart: async target => setAIPhase(supabase, payload.job_id!, target.model === OPENROUTER_MODEL ? 'running_glm' : 'fallback_gemini'),
      execute: async (target, _attempt, attemptSignal) => {
        const modelStarted = Date.now();
        const response = await callOpenRouter({
          prompt,
          responseSchema,
          apiKey: openRouterApiKey,
          model: target.model,
          signal: attemptSignal,
        });
        const providerMs = Date.now() - modelStarted;
        const parsingStarted = Date.now();
        const value = validateEvaluationResponse(parseModelJSON(response.text), questionRequired, criticalQuestions);
        console.info(`[ai-timing] ${JSON.stringify({ job_id: payload.job_id, ticket_id, model: target.model, stage: 'provider_response_and_parse', provider_ms: providerMs, parsing_ms: Date.now() - parsingStarted })}`);
        return {
          value,
          actualModel: target.model,
          routedProvider: response.routedProvider,
          routerAttempt: response.routerAttempt,
          requestId: response.requestId,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          cost: response.cost,
        };
      },
      onAttempt: record => logAIAttempt('atendimento', String(ticket_id), payload.job_id!, record),
    });
    const parsed = chain.value;
    pipelineAttempts = chain.attempts;
    console.info(`[ai-retry] ${JSON.stringify({
      event: 'pipeline_completed', evaluation_type: 'atendimento', ticket_id: String(ticket_id),
      provider: chain.provider, model: chain.model, fallback_used: chain.fallbackUsed,
      routed_provider: chain.routedProvider || null,
      provider_failover_used: (chain.routerAttempt || 1) > 1,
      attempts: chain.attempts.length,
    })}`);

    const durationMs = Date.now() - startTime;

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
      technical: { model: chain.model, attempts: chain.attempts, fallbackUsed: chain.fallbackUsed, durationMs, evaluationType: 'atendimento', callerId },
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
    pipelineAttempts = attemptsFromError(error);
    if (error instanceof AIModelError && error.reason === 'cancelled') return jsonResponse({ cancelled: true }, 409);
    console.error(`[ai-retry] ${JSON.stringify({
      event: 'pipeline_failed', evaluation_type: 'atendimento', ticket_id: String(ticket_id),
      reason: error?.reason || 'unknown_error', message: error?.message || String(error),
      attempts: pipelineAttempts.length,
    })}`);

    try {
      await supabase.from('ai_evaluation_logs').insert({
        ticket_id: String(ticket_id),
        job_id: payload.job_id,
        ticket_subject: `Ticket #${ticket_id}`,
        evaluation_type: 'atendimento',
        provider: 'openrouter',
        model: pipelineAttempts.at(-1)?.model || OPENROUTER_MODEL,
        duration_ms: Date.now() - startTime,
        status: 'error',
        error_message: error?.message || 'Falha ao avaliar com IA',
        attempts: pipelineAttempts,
        fallback_used: false,
        created_by: callerId || null,
      });
    } catch (_) {}

    return jsonResponse({
      error: error.message || 'Falha ao avaliar com IA',
      retryable: error instanceof AIModelError && error.retryable,
    }, 502);
  }
}

async function handleEvaluateChildTicket(
  payload: z.infer<typeof RequestSchema>,
  supabase: SupabaseClient,
  callerId?: string,
  signal?: AbortSignal,
): Promise<Response> {
  const { ticket_id, ticket_subject, dialogue, ticket_fields, tags, macro_type } = payload;

  if (!ticket_id) {
    return jsonResponse({ error: 'ticket_id é obrigatório para evaluate_child_ticket' }, 400);
  }

  const startTime = Date.now();
  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!openRouterApiKey) {
    return jsonResponse({ error: 'OPENROUTER_API_KEY não configurada no Supabase Secrets' }, 500);
  }

  const dialogueText = payload.dialogue_text || sanitizeDialogue(dialogue || []);
  const ticketFieldsText = (ticket_fields || []).map((f: any) => `- ${sanitizeMessageBody(f.title)}: ${sanitizeMessageBody(f.value)}`).join('\n');
  const tagsText = (tags || []).map((tag: string) => sanitizeMessageBody(tag)).join(', ');

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
- Assunto Registrado: ${sanitizeMessageBody(ticket_subject || 'Não informado')}
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

  const aiTargets = AI_TARGETS;
  const preparationMs = Date.now() - startTime;
  let pipelineAttempts: AIAttemptRecord[] = [];
  console.info(`[ai-retry] ${JSON.stringify({
    event: 'pipeline_started', evaluation_type: 'chamado_filho', ticket_id: String(ticket_id), job_id: payload.job_id,
    preparation_ms: preparationMs,
    chain: aiTargets.map(target => ({ provider: target.provider, model: target.model, max_attempts: target.maxAttempts })),
  })}`);

  try {
    const chain = await runAIModelChain({
      targets: aiTargets,
      signal,
      onTargetStart: async target => setAIPhase(supabase, payload.job_id!, target.model === OPENROUTER_MODEL ? 'running_glm' : 'fallback_gemini'),
      execute: async (target, _attempt, attemptSignal) => {
        const modelStarted = Date.now();
        const response = await callOpenRouter({
          prompt,
          responseSchema,
          apiKey: openRouterApiKey,
          model: target.model,
          signal: attemptSignal,
        });
        const providerMs = Date.now() - modelStarted;
        const parsingStarted = Date.now();
        const value = validateChildEvaluationResponse(parseModelJSON(response.text));
        console.info(`[ai-timing] ${JSON.stringify({ job_id: payload.job_id, ticket_id, model: target.model, stage: 'provider_response_and_parse', provider_ms: providerMs, parsing_ms: Date.now() - parsingStarted })}`);
        return {
          value,
          actualModel: target.model,
          routedProvider: response.routedProvider,
          routerAttempt: response.routerAttempt,
          requestId: response.requestId,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          cost: response.cost,
        };
      },
      onAttempt: record => logAIAttempt('chamado_filho', String(ticket_id), payload.job_id!, record),
    });
    const parsed = chain.value;
    pipelineAttempts = chain.attempts;
    console.info(`[ai-retry] ${JSON.stringify({
      event: 'pipeline_completed', evaluation_type: 'chamado_filho', ticket_id: String(ticket_id),
      provider: chain.provider, model: chain.model, fallback_used: chain.fallbackUsed,
      routed_provider: chain.routedProvider || null,
      provider_failover_used: (chain.routerAttempt || 1) > 1,
      attempts: chain.attempts.length,
    })}`);

    const durationMs = Date.now() - startTime;
    return jsonResponse({ success: true, technical: { model: chain.model, attempts: chain.attempts, fallbackUsed: chain.fallbackUsed, durationMs, evaluationType: 'chamado_filho', callerId }, result: parsed }, 200);
  } catch (err: any) {
    pipelineAttempts = attemptsFromError(err);
    if (err instanceof AIModelError && err.reason === 'cancelled') return jsonResponse({ cancelled: true }, 409);
    console.error(`[ai-retry] ${JSON.stringify({
      event: 'pipeline_failed', evaluation_type: 'chamado_filho', ticket_id: String(ticket_id),
      reason: err?.reason || 'unknown_error', message: err?.message || String(err),
      attempts: pipelineAttempts.length,
    })}`);
    try {
      await supabase.from('ai_evaluation_logs').insert({
        ticket_id: String(ticket_id),
        job_id: payload.job_id,
        ticket_subject: `Chamado Filho #${ticket_id}`,
        evaluation_type: 'chamado_filho',
        provider: 'openrouter',
        model: pipelineAttempts.at(-1)?.model || OPENROUTER_MODEL,
        duration_ms: Date.now() - startTime,
        status: 'error',
        error_message: err.message,
        attempts: pipelineAttempts,
        fallback_used: false,
        created_by: callerId || null,
      });
    } catch (_) {}
    return jsonResponse({
      error: err.message || 'Falha ao avaliar chamado filho',
      retryable: err instanceof AIModelError && err.retryable,
    }, 502);
  }
}
