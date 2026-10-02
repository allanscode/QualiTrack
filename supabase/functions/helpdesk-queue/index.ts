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
import { callOpenRouter, OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODELS, OPENROUTER_HANG_GUARD_MS } from './openrouter-client.ts';
import { retryAt } from './ai-retry.ts';
import { canReadQueueTicket, canRunQueueAction, shouldMergeRecentQueueSnapshot, trustedZendeskCursor, type QueueType } from './access.ts';
import { calculateCanonicalQualityScore } from './quality-score.ts';
import { satisfactionResponseTimestamp } from './satisfaction.ts';
import { CHILD_AUDITED_TAG, literalSearchTerm, queueSearchQuery, ticketCanReceiveEvaluation, ticketMatchesQueue } from './queue-search.ts';
import { childViewConditionsWithAuditExclusion, hasPublishedChildMacro } from './child-view.ts';
import { childMacroCustomFields, missingCustomFields } from './child-macro-fields.ts';
import { buildAuditorRecordPrompt, parseAuditorRecordResponse } from './auditor-record.ts';

const corsHeaders = corsFor(Deno.env.get('FRONTEND_URL'));
const AI_HANG_TIMEOUT_MS = Math.min(300_000, Math.max(1_000, Number(Deno.env.get('AI_PRIMARY_TIMEOUT_MS') || String(OPENROUTER_HANG_GUARD_MS)) || OPENROUTER_HANG_GUARD_MS));
// GLM pago primeiro; Gemma e Gemini pagos entram em sequência se necessário.
const AI_TARGETS: AIModelTarget[] = [OPENROUTER_MODEL, ...OPENROUTER_FALLBACK_MODELS].map(model => ({
  provider: 'openrouter' as const, model, maxAttempts: 2, timeoutMs: AI_HANG_TIMEOUT_MS,
}));

function phaseForAIModel(model: string): 'running_glm' | 'running_gemma' | 'fallback_gemini' {
  if (model === OPENROUTER_MODEL) return 'running_glm';
  if (model === OPENROUTER_FALLBACK_MODELS[0]) return 'running_gemma';
  return 'fallback_gemini';
}


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
const NEGATIVE_VIEW_ID = Deno.env.get('HELPDESK_NEGATIVE_VIEW_ID') || '47295789542804';
const POSITIVE_VIEW_ID = Deno.env.get('HELPDESK_POSITIVE_VIEW_ID') || '48318855861396';
// Proativas: view real do Zendesk com os tickets de CSAT vazio/não avaliado
// (ex.: 808 pesquisas vazias na view configurada) — antes essa fila não
// buscava ticket nenhum do Zendesk, só sorteava um número de ticket
// FICTÍCIO pra abrir a ficha. Agora usa tickets reais, igual as outras duas.
const PROACTIVE_VIEW_ID = Deno.env.get('HELPDESK_PROACTIVE_VIEW_ID') || '47851284392724';
const CHILD_VIEW_ID = Deno.env.get('HELPDESK_CHILD_VIEW_ID') || '47405806430228';
const INVALID_CHILD_VIEW_ID = Deno.env.get('HELPDESK_INVALID_CHILD_VIEW_ID') || '47656856998292';

// Página pequena (25) em vez de buscar tudo de uma vez — views com centenas
// de tickets (ex.: 808 em Proativas) estourariam o rate limit do Zendesk
// numa carga só. O front pede próxima página sob demanda (botão), passando
// o `cursor` devolvido na resposta anterior.
const PAGE_SIZE = 25;

function viewIdForQueue(queueType: QueueType): string {
  switch (queueType) {
    case 'negativas': return NEGATIVE_VIEW_ID;
    case 'positivas': return POSITIVE_VIEW_ID;
    case 'proativas': return PROACTIVE_VIEW_ID;
    case 'filhos': return CHILD_VIEW_ID;
    case 'filhos_invalidos': return INVALID_CHILD_VIEW_ID;
  }
}

const RequestSchema = z.object({
  action: z.enum([
    'fetch_queue',
    'fetch_draft_statuses',
    'check_queue_updates',
    'fetch_dialogue',
    'evaluate_ai',
    'evaluate_child_ticket',
    'generate_auditor_record',
    'cancel_ai_evaluation',
    'resolve_agent',
    'lookup_ticket_agent',
    'lookup_ticket',
    'publish_child_macro',
    'sync_zendesk_groups',
    'backfill_agent_team'
  ]),
  queue_type: z.enum(['negativas', 'proativas', 'positivas', 'filhos', 'filhos_invalidos']).optional(),
  ticket_id: z.string().optional(),
  child_verdict: z.enum(['conforme', 'nao_conforme']).optional(),
  comment_text: z.string().trim().min(1).max(12000).optional(),
  ticket_ids: z.array(z.string().regex(/^\d+$/)).max(100).optional(),
  job_id: z.string().uuid().optional(),
  draft_meta: z.object({
    source_queue: z.enum(['negativas', 'proativas', 'positivas']).optional(),
    form_id: z.string().uuid().nullable().optional(),
    agent_name: z.string().nullable().optional(),
    agent_email: z.string().nullable().optional(),
    agent_id: z.string().uuid().nullable().optional(),
    team_id: z.string().uuid().nullable().optional(),
    channel: z.string().nullable().optional(),
    satisfaction_comment: z.string().nullable().optional(),
    guideline_ids: z.array(z.string().uuid()).optional(),
    selection_context: z.object({
      detected_customer_type: z.enum(['cliente_final', 'revenda', 'outro']),
      suggested_form_id: z.string().uuid().nullable(),
      suggested_form_title: z.string().max(300).nullable(),
      suggested_guideline_ids: z.array(z.string().uuid()).max(50),
      suggested_guideline_titles: z.array(z.string().max(300)).max(50),
      selected_form_id: z.string().uuid().nullable(),
      selected_form_title: z.string().max(300).nullable(),
      selected_guideline_ids: z.array(z.string().uuid()).max(50),
      selected_guideline_titles: z.array(z.string().max(300)).max(50),
      overridden: z.boolean(),
      override_reason: z.string().max(500).nullable(),
      source: z.enum(['automatic', 'manual_override', 'manual_no_suggestion']),
    }).optional(),
  }).optional(),
  ticket_subject: z.string().max(500).optional(),
  ticket_status: z.string().max(40).optional(),
  search_term: z.string().max(200).optional(),
  // Cursor de paginação — vem de um `next_cursor` de uma resposta anterior
  // de fetch_queue. Ausente/null = primeira página.
  cursor: z.string().max(2000).nullable().optional(),
  form_criteria: z.object({
    sections: z.array(z.object({
      title: z.string().max(300),
      questions: z.array(z.object({
        id: z.string().max(100), text: z.string().max(2000), is_critical: z.boolean().optional(),
      }).passthrough()).max(200),
    }).passthrough()).max(50),
    critical_errors: z.array(z.object({
      id: z.string().max(100), text: z.string().max(2000),
    }).passthrough()).max(100).optional(),
  }).passthrough().optional(),
  evaluation_context: z.object({
    score: z.number().min(0).max(100),
    answers: z.record(z.enum(['SIM', 'NAO', 'NA'])),
    observations: z.record(z.string().max(5000)),
    critical_errors: z.record(z.boolean()),
    critical_error_observations: z.record(z.string().max(5000)),
  }).optional(),
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
/** Vincula um novo agente à equipe gestora, nunca ao grupo do ticket. */
async function ensureAgentTeamMembership(supabase: SupabaseClient, userId: string, teamId: string): Promise<void> {
  // Apenas operadores (role 'suporte') recebem vínculos automáticos.
  // Para gestores, auditores e admins, user_teams define seus escopos de supervisão e permissão,
  // controlados exclusivamente no painel de administração.
  const { data: user } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  if (user && user.role !== 'suporte') {
    return;
  }

  const { error } = await supabase.from('user_teams')
    .upsert({ user_id: userId, team_id: teamId }, { onConflict: 'user_id,team_id', ignoreDuplicates: true });
  if (error) throw new Error(`Não foi possível vincular o agente à equipe: ${error.message}`);
}

async function resolveZendeskTicketGroup(
  supabase: SupabaseClient,
  zendeskGroupId?: number,
  groupName?: string,
): Promise<{ id: string; team_id?: string } | null> {
  let row: { id: string; kind?: string } | null = null;
  if (zendeskGroupId) {
    const result = await supabase.from('teams')
      .select('id, kind').eq('zendesk_group_id', zendeskGroupId).maybeSingle();
    row = result.data;
  }
  if (!row && groupName) {
    const result = await supabase.from('teams')
      .select('id, kind').eq('kind', 'group').ilike('name', groupName.trim()).limit(1);
    row = result.data?.[0] || null;
  }
  if (!row) return null;
  if (row.kind !== 'group') return { id: row.id, team_id: row.id };
  const { data: links, error } = await supabase.from('team_groups')
    .select('team_id').eq('group_id', row.id).limit(2);
  if (error) throw error;
  return { id: row.id, team_id: links?.length === 1 ? links[0].team_id : undefined };
}

async function resolveOrCreateAgent(
  supabase: SupabaseClient,
  email: string | undefined,
  name: string | undefined,
  externalId: string | number | undefined,
  sourceSystem: string,
  teamName: string | undefined,
  // Quando o chamador já sabe o team_id exato (ex.: monitor selecionou a
  // equipe na própria ficha), pula o match por nome e usa direto.
  explicitTeamId?: string,
  backfillExisting = true,
  zendeskGroupId?: number,
): Promise<{ id?: string; team_id?: string; ticket_group_team_id?: string } | null> {
  if (!email) return null;
  const normalizedEmail = email.trim().toLowerCase();

  // team_ids não existe mais em public.users (migração 20260522000005) —
  // multi-equipe é via public.user_teams; primary_team_id continua sendo
  // a equipe principal de exibição.
  const { data: existing } = await supabase
    .from('users')
    .select('id, role, primary_team_id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  // Um grupo do Zendesk identifica o ticket. Só sua equipe responsável pode
  // tornar-se equipe principal do agente e dona da monitoria.
  let teamId: string | undefined = explicitTeamId;
  let ticketGroupTeamId: string | undefined;
  if (sourceSystem === 'zendesk' && (zendeskGroupId || teamName)) {
    const group = await resolveZendeskTicketGroup(supabase, zendeskGroupId, teamName);
    ticketGroupTeamId = group?.id;
    teamId = group?.team_id || teamId;
  }

  if (existing) {
    const resolvedTeamId = (backfillExisting && existing.role === 'suporte')
      ? await backfillAgentTeamIfMissing(supabase, existing.id as string,
        existing.primary_team_id as string | null | undefined, teamId)
      : ((existing.primary_team_id as string | undefined) || teamId);
    return { id: existing.id as string, team_id: resolvedTeamId, ticket_group_team_id: ticketGroupTeamId };
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
    return teamId || ticketGroupTeamId ? { team_id: teamId, ticket_group_team_id: ticketGroupTeamId } : null;
  }

  // Espelha o vínculo em user_teams (fonte de verdade para multi-equipe).
  if (teamId) {
    await ensureAgentTeamMembership(supabase, created.id, teamId);
  }

  return { id: created.id as string, team_id: teamId, ticket_group_team_id: ticketGroupTeamId };
}

async function reconcilePublishedChildMacros(supabase: SupabaseClient): Promise<Response> {
  const subdomain = Deno.env.get('ZENDESK_SUBDOMAIN');
  const email = Deno.env.get('ZENDESK_EMAIL');
  const token = Deno.env.get('ZENDESK_API_TOKEN');
  if (!subdomain || !email || !token) return jsonResponse({ error: 'Zendesk não configurado.' }, 500);
  const headers = {
    Authorization: `Basic ${btoa(`${email}/token:${token}`)}`,
    'Content-Type': 'application/json', Accept: 'application/json',
  };
  const base = `https://${subdomain}.zendesk.com/api/v2`;
  const ticketIds = new Set<string>();
  let truncated = false;

  for (const viewId of new Set([CHILD_VIEW_ID, INVALID_CHILD_VIEW_ID].filter(Boolean))) {
    const viewUrl = `${base}/views/${viewId}.json`;
    const viewResponse = await fetch(viewUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (!viewResponse.ok) return jsonResponse({ error: `Falha ao ler a view ${viewId} (${viewResponse.status}).` }, 502);
    const view = (await viewResponse.json()).view;
    let conditions: ReturnType<typeof childViewConditionsWithAuditExclusion>;
    try { conditions = childViewConditionsWithAuditExclusion(view); }
    catch { return jsonResponse({ error: `Condições incompletas na view ${viewId}.` }, 502); }
    if (conditions) {
      const update = await fetch(viewUrl, {
        method: 'PUT', headers, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ view: conditions }),
      });
      if (!update.ok) return jsonResponse({ error: `Falha ao atualizar a view ${viewId} (${update.status}).` }, 502);
    }

    let next: string | null = `${base}/views/${viewId}/tickets.json?page[size]=25`;
    for (let page = 0; next && page < 4; page++) {
      const response = await fetch(next, { headers, signal: AbortSignal.timeout(15000) });
      if (!response.ok) return jsonResponse({ error: `Falha ao listar a view ${viewId} (${response.status}).` }, 502);
      const body = await response.json();
      for (const ticket of body.tickets || []) if (ticket.id) ticketIds.add(String(ticket.id));
      const candidate = body.meta?.has_more ? body.links?.next : null;
      if (candidate && !String(candidate).startsWith(`${base}/views/${viewId}/tickets.json`)) {
        return jsonResponse({ error: `Paginação inesperada na view ${viewId}.` }, 502);
      }
      next = candidate || null;
    }
    if (next) truncated = true;
  }

  const updated: string[] = [];
  const alreadyMarked: string[] = [];
  const withoutMacro: string[] = [];
  const errors: string[] = [];
  for (const id of ticketIds) {
    try {
      const ticketUrl = `${base}/tickets/${id}.json`;
      const ticketResponse = await fetch(ticketUrl, { headers, signal: AbortSignal.timeout(10000) });
      if (!ticketResponse.ok) throw new Error(`ticket ${ticketResponse.status}`);
      const ticket = (await ticketResponse.json()).ticket;
      if (!Array.isArray(ticket?.tags) || typeof ticket.updated_at !== 'string') throw new Error('ticket incompleto');
      if (ticket.tags.includes(CHILD_AUDITED_TAG)) { alreadyMarked.push(id); continue; }
      const commentsResponse = await fetch(`${base}/tickets/${id}/comments.json?sort_order=desc&per_page=100`, {
        headers, signal: AbortSignal.timeout(10000),
      });
      if (!commentsResponse.ok) throw new Error(`comentários ${commentsResponse.status}`);
      if (!hasPublishedChildMacro((await commentsResponse.json()).comments)) { withoutMacro.push(id); continue; }
      const update = await fetch(ticketUrl, {
        method: 'PUT', headers, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ ticket: {
          tags: [...ticket.tags, CHILD_AUDITED_TAG], safe_update: true, updated_stamp: ticket.updated_at,
        } }),
      });
      if (!update.ok) throw new Error(`atualização ${update.status}`);
      const { data: rows, error: readError } = await supabase.from('queue_ticket_catalog')
        .select('queue_type,ticket_snapshot').eq('ticket_id', id).in('queue_type', ['filhos', 'filhos_invalidos']);
      if (readError) throw new Error('catálogo não consultado');
      for (const row of rows || []) {
        const snapshot = row.ticket_snapshot && typeof row.ticket_snapshot === 'object' ? row.ticket_snapshot : {};
        const tags = Array.isArray(snapshot.tags) ? snapshot.tags : ticket.tags;
        const { error } = await supabase.from('queue_ticket_catalog')
          .update({ ticket_snapshot: { ...snapshot, tags: [...new Set([...tags, CHILD_AUDITED_TAG])] } })
          .eq('ticket_id', id).eq('queue_type', row.queue_type);
        if (error) throw new Error('catálogo não atualizado');
      }
      updated.push(id);
    } catch (error) {
      errors.push(`${id}: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  }
  return jsonResponse({ success: errors.length === 0 && !truncated, scanned: ticketIds.size,
    updated, already_marked: alreadyMarked, without_macro: withoutMacro, errors, truncated }, 200);
}

// Correção pontual: aplica só os campos da macro QA Válido/Invalidado em um
// chamado filho cujo comentário já foi publicado sem os campos. Não posta
// comentário nem mexe em tags.
async function applyChildMacroFields(ticketId: string, verdict: 'conforme' | 'nao_conforme'): Promise<Response> {
  const subdomain = Deno.env.get('ZENDESK_SUBDOMAIN');
  const email = Deno.env.get('ZENDESK_EMAIL');
  const token = Deno.env.get('ZENDESK_API_TOKEN');
  if (!subdomain || !email || !token) return jsonResponse({ error: 'Zendesk não configurado.' }, 500);
  if (!/^\d+$/.test(ticketId)) return jsonResponse({ error: 'ticket_id inválido.' }, 400);
  const headers = {
    Authorization: `Basic ${btoa(`${email}/token:${token}`)}`,
    'Content-Type': 'application/json', Accept: 'application/json',
  };
  const ticketUrl = `https://${subdomain}.zendesk.com/api/v2/tickets/${ticketId}.json`;
  const current = await fetch(ticketUrl, { headers, signal: AbortSignal.timeout(10000) });
  if (!current.ok) return jsonResponse({ error: `Zendesk não encontrou o ticket (${current.status}).` }, 502);
  const ticket = (await current.json()).ticket;
  if (typeof ticket?.updated_at !== 'string') return jsonResponse({ error: 'Versão do ticket indisponível.' }, 502);
  const commentsResponse = await fetch(`${ticketUrl.replace('.json', '')}/comments.json?sort_order=desc&per_page=100`, {
    headers, signal: AbortSignal.timeout(10000),
  });
  if (!commentsResponse.ok || !hasPublishedChildMacro((await commentsResponse.json()).comments)) {
    return jsonResponse({ error: 'O ticket não tem a macro de chamado filho publicada; nada foi alterado.' }, 409);
  }
  const fields = childMacroCustomFields(verdict);
  const update = await fetch(ticketUrl, {
    method: 'PUT', headers, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ ticket: { custom_fields: fields, safe_update: true, updated_stamp: ticket.updated_at } }),
  });
  if (!update.ok) return jsonResponse({ error: `Zendesk recusou a atualização (${update.status}).` }, 502);
  const missing = missingCustomFields((await update.json().catch(() => null))?.ticket?.custom_fields, fields);
  return jsonResponse({ success: missing.length === 0, ticket_id: ticketId, verdict, missing_fields: missing }, 200);
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
    if (workerBody?.action === 'reconcile_child_macros') {
      if (req.headers.get('apikey') !== secretApiKey()) {
        return jsonResponse({ error: 'Worker não autorizado.' }, 403);
      }
      const workerClient = createClient(Deno.env.get('SUPABASE_URL')!, secretApiKey());
      return await reconcilePublishedChildMacros(workerClient);
    }
    if (workerBody?.action === 'apply_child_macro_fields') {
      if (req.headers.get('apikey') !== secretApiKey()) {
        return jsonResponse({ error: 'Worker não autorizado.' }, 403);
      }
      if (!['conforme', 'nao_conforme'].includes(workerBody.verdict)) {
        return jsonResponse({ error: 'verdict deve ser conforme ou nao_conforme.' }, 400);
      }
      return await applyChildMacroFields(String(workerBody.ticket_id ?? ''), workerBody.verdict);
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

    if (!canRunQueueAction(caller.role as string, action)) {
      return jsonResponse({ error: 'Apenas a equipe de Qualidade pode auditar chamados.' }, 403);
    }

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
    if (action === 'evaluate_ai' || action === 'evaluate_child_ticket' || action === 'generate_auditor_record') {
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

    // 3. Avaliação com IA: GLM, Gemma e Gemini pagos, nessa ordem.
    if (action === 'evaluate_ai') {
      return await executeAndPersistAIJob(parseResult.data, supabase, user.id,
        signal => handleEvaluateAI(parseResult.data, supabase, user.id, signal));
    }

    if (action === 'evaluate_child_ticket') {
      return await executeAndPersistAIJob(parseResult.data, supabase, user.id,
        signal => handleEvaluateChildTicket(parseResult.data, supabase, user.id, signal));
    }

    if (action === 'generate_auditor_record') {
      return await handleGenerateAuditorRecord(parseResult.data, supabase, user.id, req.signal);
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

    if (action === 'publish_child_macro') {
      const { child_verdict, comment_text } = parseResult.data;
      if (!ticket_id || !child_verdict || !comment_text) {
        return jsonResponse({ error: 'Ticket, veredito e texto da macro são obrigatórios.' }, 400);
      }
      const { data: catalog, error: catalogError } = await supabase.from('queue_ticket_catalog')
        .select('queue_type,verified_at').eq('ticket_id', ticket_id).maybeSingle();
      const verifiedAt = Date.parse(catalog?.verified_at || '');
      if (catalogError || !catalog || !['filhos', 'filhos_invalidos'].includes(catalog.queue_type)
        || !Number.isFinite(verifiedAt) || verifiedAt < Date.now() - 2 * 60 * 60_000) {
        return jsonResponse({ error: 'Chamado filho não verificado na fila. Atualize a fila e tente novamente.' }, 403);
      }
      if (caller.role === 'qualidade' && catalog.queue_type === 'filhos') {
        const { data: assignment, error: assignmentError } = await supabase.from('queue_ticket_assignments')
          .select('assigned_to').eq('ticket_id', ticket_id).eq('queue_type', 'filhos').maybeSingle();
        if (assignmentError || assignment?.assigned_to !== user.id) {
          return jsonResponse({ error: 'Este chamado filho não está atribuído a você.' }, 403);
        }
      }
      const rate = await supabase.rpc('consume_security_rate_limit', {
        bucket_key: `helpdesk-queue:publish-child:${user.id}`, max_requests: 5, window_seconds: 60,
      });
      if (rate.error || !rate.data) return jsonResponse({ error: 'Aguarde antes de publicar outra macro.' }, 429);

      const ticketUrl = `https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}.json`;
      const ticketResponse = await fetch(ticketUrl, { headers: zendeskHeaders, signal: AbortSignal.timeout(10000) });
      if (!ticketResponse.ok) return jsonResponse({ error: `Zendesk não encontrou o ticket (${ticketResponse.status}).` }, 502);
      const ticketBody = await ticketResponse.json();
      if (['closed', 'archived'].includes(String(ticketBody.ticket?.status || '').toLowerCase())) {
        return jsonResponse({ error: 'O ticket está fechado no Zendesk e não aceita comentários.' }, 409);
      }

      if (!Array.isArray(ticketBody.ticket?.tags)) {
        return jsonResponse({ error: 'Zendesk não retornou as tags atuais do ticket. Atualize e tente novamente.' }, 502);
      }
      const currentTags: string[] = ticketBody.ticket.tags;
      const syncCatalog = async () => {
        const { data: catalogRows, error: catalogReadError } = await supabase.from('queue_ticket_catalog')
          .select('queue_type,ticket_snapshot').eq('ticket_id', ticket_id).in('queue_type', ['filhos', 'filhos_invalidos']);
        if (catalogReadError) console.error('[helpdesk-queue] Falha ao consultar catálogo após macro:', catalogReadError);
        for (const row of catalogRows || []) {
          const snapshot = row.ticket_snapshot && typeof row.ticket_snapshot === 'object' ? row.ticket_snapshot : {};
          const tags = Array.isArray(snapshot.tags) ? snapshot.tags : currentTags;
          const { error: catalogUpdateError } = await supabase.from('queue_ticket_catalog')
            .update({ ticket_snapshot: { ...snapshot, tags: [...new Set([...tags, CHILD_AUDITED_TAG])] } })
            .eq('ticket_id', ticket_id).eq('queue_type', row.queue_type);
          if (catalogUpdateError) console.error('[helpdesk-queue] Falha ao atualizar catálogo após macro:', catalogUpdateError);
        }
      };
      const updatedStamp = ticketBody.ticket?.updated_at;
      if (typeof updatedStamp !== 'string' || !updatedStamp) {
        return jsonResponse({ error: 'Zendesk não retornou a versão atual do ticket. Atualize e tente novamente.' }, 502);
      }

      // A tag só tira o ticket da view se ambas as views a excluírem. Preserva
      // todos os filtros existentes e configura a exclusão uma única vez.
      for (const viewId of new Set([CHILD_VIEW_ID, INVALID_CHILD_VIEW_ID].filter(Boolean))) {
        const viewUrl = `https://${subdomain}.zendesk.com/api/v2/views/${viewId}.json`;
        const viewResponse = await fetch(viewUrl, { headers: zendeskHeaders, signal: AbortSignal.timeout(10000) });
        if (!viewResponse.ok) return jsonResponse({ error: `Não foi possível conferir a view ${viewId} no Zendesk (${viewResponse.status}). Nenhuma macro foi enviada.` }, 502);
        const viewBody = await viewResponse.json();
        let conditions: ReturnType<typeof childViewConditionsWithAuditExclusion>;
        try { conditions = childViewConditionsWithAuditExclusion(viewBody.view); }
        catch { return jsonResponse({ error: `A view ${viewId} não retornou filtros completos. Nenhuma macro foi enviada.` }, 502); }
        if (!conditions) continue;
        const updateResponse = await fetch(viewUrl, {
          method: 'PUT', headers: zendeskHeaders, signal: AbortSignal.timeout(10000),
          body: JSON.stringify({ view: conditions }),
        });
        if (!updateResponse.ok) return jsonResponse({ error: `Não foi possível configurar a saída da view ${viewId} (${updateResponse.status}). Nenhuma macro foi enviada.` }, 502);
      }

      if (currentTags.includes(CHILD_AUDITED_TAG)) {
        await syncCatalog();
        return jsonResponse({ success: true, ticket_id, verdict: child_verdict, already_sent: true }, 200);
      }

      // A versão antiga postava somente o comentário. Se ele já existe, faz
      // apenas a marcação de saída; repetir a macro criaria comentário duplicado.
      const commentsResponse = await fetch(
        `https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}/comments.json?sort_order=desc&per_page=100`,
        { headers: zendeskHeaders, signal: AbortSignal.timeout(10000) },
      );
      if (!commentsResponse.ok) return jsonResponse({ error: 'Não foi possível conferir envios anteriores no Zendesk. Nenhuma macro foi enviada.' }, 502);
      const commentsBody = await commentsResponse.json();
      const previousMacro = hasPublishedChildMacro(commentsBody.comments);

      const verdictLabel = child_verdict === 'conforme' ? 'VÁLIDO' : 'INVÁLIDO';
      // Espelha as ações da macro "QA | Ticket Válido/Invalidado" do Zendesk.
      const macroFields = childMacroCustomFields(child_verdict === 'conforme' ? 'conforme' : 'nao_conforme');
      const response = await fetch(ticketUrl, {
        method: 'PUT', headers: zendeskHeaders, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ ticket: {
          ...(previousMacro ? {} : { comment: {
            body: `[QualidadeWP · Chamado filho ${verdictLabel}]\n\n${comment_text}`,
            public: false,
          } }),
          custom_fields: macroFields,
          tags: [...currentTags, CHILD_AUDITED_TAG], safe_update: true, updated_stamp: updatedStamp,
        } }),
      });
      if (response.status === 409) return jsonResponse({ error: 'O ticket mudou no Zendesk. Atualize a fila e tente novamente.' }, 409);
      if (!response.ok) return jsonResponse({ error: `Zendesk recusou a macro (${response.status}).` }, 502);
      const updatedBody = await response.json().catch(() => null);
      const missingFields = missingCustomFields(updatedBody?.ticket?.custom_fields, macroFields);
      if (missingFields.length) {
        console.error('[helpdesk-queue] Zendesk não gravou os campos da macro no ticket filho:', ticket_id, missingFields);
      }

      await syncCatalog();
      return jsonResponse({ success: true, ticket_id, verdict: child_verdict, already_sent: previousMacro }, 200);
    }

    if (action === 'fetch_draft_statuses') {
      const ids = parseResult.data.ticket_ids;
      if (!ids?.length) return jsonResponse({ error: 'IDs de tickets obrigatórios.' }, 400);
      const response = await fetch(
        `https://${subdomain}.zendesk.com/api/v2/tickets/show_many?ids=${ids.join(',')}`,
        { headers: zendeskHeaders, signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) return jsonResponse({ error: `Zendesk falhou (${response.status}).` }, 502);
      const body = await response.json();
      const statuses = Object.fromEntries((body.tickets || [])
        .filter((ticket: { id: number; status?: string }) => ids.includes(String(ticket.id)))
        .map((ticket: { id: number; status?: string }) => [String(ticket.id), ticket.status || 'unknown']));
      return jsonResponse({ statuses }, 200);
    }

    // Consulta somente IDs da primeira página. Não cria agentes, não altera
    // atribuições e não troca os cards que o usuário está analisando.
    if (action === 'check_queue_updates') {
      if (!queue_type) return jsonResponse({ error: 'Fila obrigatória.' }, 400);
      if (!['admin', 'gestor_qualidade', 'qualidade', 'gestor_suporte'].includes(caller.role as string)) {
        return jsonResponse({ error: 'Sem acesso à fila.' }, 403);
      }
      const viewId = viewIdForQueue(queue_type);
      let url: string;
      if (viewId) {
        const sortBy = queue_type === 'proativas' ? 'created' : 'updated';
        url = `https://${subdomain}.zendesk.com/api/v2/views/${viewId}/tickets.json?page[size]=${PAGE_SIZE}&sort_by=${sortBy}&sort_order=desc`;
      } else {
        const query = queueSearchQuery(queue_type, VALIDATED_TAG);
        const sortBy = queue_type === 'proativas' ? 'created_at' : 'updated_at';
        url = `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(query)}&sort_by=${sortBy}&sort_order=desc&per_page=${PAGE_SIZE}`;
      }
      const response = await fetch(url, { headers: zendeskHeaders });
      if (!response.ok) return jsonResponse({ error: `Zendesk falhou (${response.status}).` }, 502);
      const body = await response.json();
      const rows = viewId ? body.tickets : body.results;
      let ids: string[] = (Array.isArray(rows) ? rows : [])
        .filter((ticket: any) => ticketCanReceiveEvaluation(ticket, queue_type))
        .map((ticket: { id: number }) => String(ticket.id));
      if (ids.length > 0) {
        const { data: completed, error: completedError } = await supabase.from('monitorias')
          .select('ticket_id').in('ticket_id', ids);
        if (completedError) return jsonResponse({ error: 'Falha ao conferir monitorias.' }, 500);
        const completedIds = new Set((completed || []).map(row => row.ticket_id));
        ids = ids.filter(id => !completedIds.has(id));
        if (ids.length > 0 && caller.role === 'qualidade' && (queue_type === 'negativas' || queue_type === 'filhos')) {
          const { data: assigned, error: assignmentError } = await supabase.from('queue_ticket_assignments')
            .select('ticket_id').eq('queue_type', queue_type).eq('assigned_to', user.id).in('ticket_id', ids);
          if (assignmentError) return jsonResponse({ error: 'Falha ao conferir atribuições.' }, 500);
          const assignedIds = new Set((assigned || []).map(row => row.ticket_id));
          ids = ids.filter(id => assignedIds.has(id));
        }
      }
      return jsonResponse({ ticket_ids: ids }, 200);
    }

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

    // 6. Sincroniza a identidade dos grupos do Zendesk. Equipes gestoras
    // com o mesmo nome continuam separadas dos grupos de ticket.
    // Restrito a admin: criar Team usa a mesma regra de RLS de
    // TeamsManagement (só admin escreve em public.teams), e aqui a Edge
    // Function usa service role (ignora RLS), então a checagem é manual.
    if (action === 'sync_zendesk_groups') {
      if (caller.role !== 'admin') {
        return jsonResponse({ error: 'Apenas administradores podem sincronizar equipes do Zendesk.' }, 403);
      }

      const zendeskGroups: { id: number; name: string }[] = [];
      const origin = `https://${subdomain}.zendesk.com`;
      let nextUrl: string | null = `${origin}/api/v2/groups.json?per_page=100`;
      while (nextUrl) {
        const groupsResp = await fetch(nextUrl, { headers: zendeskHeaders });
        if (!groupsResp.ok) throw new Error(`Zendesk Groups API falhou (${groupsResp.status}).`);
        const groupsData = await groupsResp.json();
        zendeskGroups.push(...(groupsData.groups || []));
        const candidate = groupsData.next_page as string | null;
        if (candidate && new URL(candidate).origin !== origin) throw new Error('Paginação Zendesk inválida.');
        nextUrl = candidate;
      }

      const { data: existingTeams, error: teamError } = await supabase
        .from('teams').select('id, name, kind, zendesk_group_id');
      if (teamError) throw teamError;
      const knownTeams = existingTeams || [];

      const created: string[] = [];
      for (const g of zendeskGroups) {
        const name = (g.name || '').trim();
        if (!name) continue;
        // O antigo "Grupo WebPosto" virou a equipe principal. Não recriar
        // esse marcador organizacional como grupo de tickets.
        if (name.toLowerCase() === 'grupo webposto' || name.toLowerCase() === 'webposto') continue;
        const match = knownTeams.find(t => t.kind === 'group' && t.zendesk_group_id === g.id)
          || knownTeams.find(t => t.kind === 'group' && !t.zendesk_group_id && t.name.trim().toLowerCase() === name.toLowerCase());
        if (match) {
          if (match.zendesk_group_id !== g.id) {
            const { error: linkError } = await supabase.from('teams')
              .update({ zendesk_group_id: g.id }).eq('id', match.id);
            if (linkError) throw linkError;
            match.zendesk_group_id = g.id;
          }
          if (match.name !== name) {
            const { error: renameError } = await supabase.from('teams')
              .update({ name }).eq('id', match.id);
            if (renameError) throw renameError;
            match.name = name;
          }
          continue;
        }
        const { error: insertError } = await supabase.from('teams')
          .insert({ name, active: true, kind: 'group', zendesk_group_id: g.id });
        if (insertError) {
          throw insertError;
        }
        created.push(name);
      }

      return jsonResponse({ success: true, created, pending: [] }, 200);
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

      const searchTerm = parseResult.data.search_term?.trim();

      if (searchTerm) {
        const numericMatch = searchTerm.match(/^#?(\d+)$/);
        if (numericMatch) {
          const targetTicketId = numericMatch[1];
          const ticketUrl = `https://${subdomain}.zendesk.com/api/v2/tickets/${targetTicketId}.json?include=users,groups,organizations`;
          const response = await fetch(ticketUrl, { headers: zendeskHeaders });
          if (response.ok) {
            const ticketData = await response.json();
            const t = ticketData.ticket;
            const matchesQueue = t && ticketMatchesQueue(t, queue_type, VALIDATED_TAG);
            if (matchesQueue) {
              results = [t];
              sideloadedUsers = new Map<number, any>((ticketData.users || []).map((u: any) => [u.id, u]));
              sideloadedGroups = new Map<number, any>((ticketData.groups || []).map((g: any) => [g.id, g]));
              sideloadedOrgs = new Map<number, any>((ticketData.organizations || []).map((o: any) => [o.id, o]));
            } else {
              results = [];
              sideloadedUsers = new Map();
              sideloadedGroups = new Map();
              sideloadedOrgs = new Map();
            }
          } else if (response.status === 404) {
            results = [];
            sideloadedUsers = new Map();
            sideloadedGroups = new Map();
            sideloadedOrgs = new Map();
          } else {
            throw new Error(`Zendesk Tickets API falhou (${response.status}).`);
          }
          hasMore = false;
          nextCursor = null;
        } else {
          // Busca textual na base do Zendesk usando Search API
          let searchQuery = queueSearchQuery(queue_type, VALIDATED_TAG);
          try {
            searchQuery += ` ${literalSearchTerm(searchTerm)}`;
          } catch {
            return jsonResponse({ error: 'Informe palavras ou o número do ticket.' }, 400);
          }

          let trustedCursor: string | null;
          try {
            trustedCursor = trustedZendeskCursor(parseResult.data.cursor, subdomain,
              '/api/v2/search.json', searchQuery);
          } catch {
            return jsonResponse({ error: 'Cursor de paginação inválido.' }, 400);
          }
          const url = trustedCursor
            || `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(searchQuery)}&sort_by=created_at&sort_order=desc&include=users,groups,organizations&per_page=${PAGE_SIZE}`;
          const response = await fetch(url, { headers: zendeskHeaders });
          if (!response.ok) {
            throw new Error(`Zendesk Search API falhou (${response.status}).`);
          }

          const searchData = await response.json();
          results = (searchData.results || []).filter((ticket: Parameters<typeof ticketMatchesQueue>[0]) => ticketMatchesQueue(ticket, queue_type, VALIDATED_TAG));
          sideloadedUsers = new Map<number, any>((searchData.users || []).map((u: any) => [u.id, u]));
          sideloadedGroups = new Map<number, any>((searchData.groups || []).map((g: any) => [g.id, g]));
          sideloadedOrgs = new Map<number, any>((searchData.organizations || []).map((o: any) => [o.id, o]));
          nextCursor = searchData.next_page || null;
          hasMore = Boolean(nextCursor);
        }
      } else {
        // Quando a view real do Zendesk está configurada, busca exatamente os
        // tickets dela (mesma contagem que a equipe vê lá dentro), em vez de
        // reconstruir o filtro via Search API.
        const viewId = viewIdForQueue(queue_type);

        if (viewId) {
          let trustedCursor: string | null;
          try { trustedCursor = trustedZendeskCursor(parseResult.data.cursor, subdomain,
            `/api/v2/views/${viewId}/tickets.json`); }
          catch { return jsonResponse({ error: 'Cursor de paginação inválido.' }, 400); }
          const url = trustedCursor
            || `https://${subdomain}.zendesk.com/api/v2/views/${viewId}/tickets.json?include=users,groups,organizations&page[size]=${PAGE_SIZE}${queue_type === 'proativas' ? '&sort_by=created&sort_order=desc' : ''}`;

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
          let searchQuery = 'type:ticket status<closed';

          if (queue_type === 'negativas') {
            searchQuery += ' satisfaction:bad';
            // Chamados já apurados/validados pela qualidade (tag aplicada via
            // macro) saem da fila — só filtra se a tag real estiver configurada.
            if (VALIDATED_TAG) {
              searchQuery += ` -tags:${VALIDATED_TAG}`;
            }
          } else if (queue_type === 'positivas') {
            searchQuery += ' satisfaction:good';
          } else if (queue_type === 'filhos') {
            searchQuery += ' tags:existe_ticket_filho';
          } else if (queue_type === 'filhos_invalidos') {
            searchQuery += ' tags:ticket_filho_invalido';
          } else {
            // Proativas: CSAT nunca respondido pelo cliente (não é "sem
            // filtro nenhum" como antes — isso trazia qualquer ticket
            // solved/closed, sem relação com equidade de monitoria).
            searchQuery += ' satisfaction:unoffered';
          }

          // Sideload de usuários, grupos e organizações para resolver o atendente (nome/e-mail),
          // a equipe de origem e o tipo de cliente (organização/tags) de cada chamado.
          let trustedCursor: string | null;
          try { trustedCursor = trustedZendeskCursor(parseResult.data.cursor, subdomain,
            '/api/v2/search.json', searchQuery); }
          catch { return jsonResponse({ error: 'Cursor de paginação inválido.' }, 400); }
          const url = trustedCursor
            || `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(searchQuery)}&sort_by=created_at&sort_order=desc&include=users,groups,organizations&per_page=${PAGE_SIZE}`;
          const response = await fetch(url, { headers: zendeskHeaders });

          if (!response.ok) {
            throw new Error(`Zendesk Search API falhou (${response.status}).`);
          }

          const searchData = await response.json();
          results = searchData.results || [];
          sideloadedUsers = new Map<number, any>((searchData.users || []).map((u: any) => [u.id, u]));
          sideloadedGroups = new Map<number, any>((searchData.groups || []).map((g: any) => [g.id, g]));
          sideloadedOrgs = new Map<number, any>((searchData.organizations || []).map((o: any) => [o.id, o]));
          nextCursor = searchData.next_page || null;
          hasMore = Boolean(nextCursor);
        }
      }

      results = results.filter((ticket: any) => ticketCanReceiveEvaluation(ticket, queue_type));

      // O ticket embute score/comentário, mas não o instante da resposta.
      // Reaproveita primeiro o snapshot recente e só busca ratings ainda sem
      // horário, em lotes pequenos e com timeout, para preservar a cota da API.
      const satisfactionRatedAt = new Map<string, string>();
      const solvedAt = new Map<string, string>();
      const resultTicketIds = results.map((ticket: any) => String(ticket.id));
      if (resultTicketIds.length > 0) {
        const { data: cachedTickets, error: cachedTicketsError } = await supabase
          .from('queue_ticket_catalog')
          .select('ticket_id, ticket_snapshot')
          .eq('queue_type', queue_type)
          .in('ticket_id', resultTicketIds);
        if (cachedTicketsError) throw new Error(`Falha ao ler cache de horário CSAT: ${cachedTicketsError.message}`);
        for (const cached of cachedTickets || []) {
          const timestamp = cached.ticket_snapshot?.csat_rated_at;
          if (typeof timestamp === 'string' && timestamp) satisfactionRatedAt.set(cached.ticket_id, timestamp);
          const current = results.find((ticket: { id: number; status?: string; updated_at?: string }) =>
            String(ticket.id) === cached.ticket_id);
          const resolved = cached.ticket_snapshot?.solved_at;
          if (current?.status === 'solved' && typeof current.updated_at === 'string'
            && current.updated_at === cached.ticket_snapshot?.zendesk_updated_at
            && typeof resolved === 'string' && resolved) solvedAt.set(cached.ticket_id, resolved);
        }
      }
      const solvedLookup = (async () => {
        const pending = results.filter((ticket: { id: number; status?: string }) =>
          ticket.status === 'solved' && !solvedAt.has(String(ticket.id)));
        const deadline = Date.now() + 8_000;
        for (let offset = 0; offset < pending.length; offset += 5) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0) break;
          await Promise.all(pending.slice(offset, offset + 5).map(async (ticket: { id: number }) => {
            try {
              const response = await fetch(`https://${subdomain}.zendesk.com/api/v2/tickets/${ticket.id}/metrics`, {
                headers: zendeskHeaders, signal: AbortSignal.timeout(remainingMs),
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const body = await response.json() as {
                ticket_metric?: { solved_at?: string | null } | Array<{ solved_at?: string | null }>;
              };
              const metric = Array.isArray(body.ticket_metric) ? body.ticket_metric[0] : body.ticket_metric;
              if (metric?.solved_at) solvedAt.set(String(ticket.id), metric.solved_at);
            } catch (error) {
              console.warn(`[helpdesk-queue] Não foi possível obter a resolução do ticket ${ticket.id}:`, error);
            }
          }));
        }
      })();
      const ratedTickets = results.filter((ticket: any) =>
        ticket.satisfaction_rating?.id && ['bad', 'bad_with_comment', 'good', 'good_with_comment'].includes(ticket.satisfaction_rating?.score)
        && !satisfactionRatedAt.has(String(ticket.id))
      );
      const satisfactionLookupDeadline = Date.now() + 5_000;
      for (let offset = 0; offset < ratedTickets.length; offset += 5) {
        const remainingMs = satisfactionLookupDeadline - Date.now();
        if (remainingMs <= 0) break;
        await Promise.all(ratedTickets.slice(offset, offset + 5).map(async (ticket: any) => {
          try {
            const response = await fetch(
              `https://${subdomain}.zendesk.com/api/v2/satisfaction_ratings/${ticket.satisfaction_rating.id}`,
              { headers: zendeskHeaders, signal: AbortSignal.timeout(remainingMs) },
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const timestamp = satisfactionResponseTimestamp(await response.json());
            if (timestamp) satisfactionRatedAt.set(String(ticket.id), timestamp);
          } catch (error) {
            console.warn(`[helpdesk-queue] Não foi possível obter o horário CSAT do ticket ${ticket.id}:`, error);
          }
        }));
      }
      await solvedLookup;

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
          group?.name,
          undefined,
          false,
          group?.id,
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
          csat_rated_at: satisfactionRatedAt.get(String(t.id)) || undefined,
          solved_at: solvedAt.get(String(t.id)) || undefined,
          ticket_date: t.created_at || null,
          zendesk_updated_at: t.updated_at || null,
          status: t.status || 'solved',
          url: `https://${subdomain}.zendesk.com/agent/tickets/${t.id}`,
          agent_name: assignee?.name,
          agent_email: assignee?.email,
          agent_id: agentLink?.id,
          team_id: agentLink?.team_id,
          ticket_group_team_id: agentLink?.ticket_group_team_id,
          group_name: group?.name,
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
            ticket_snapshot: t,
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

      // A mesma janela recente alimenta monitor e supervisao. Assim, um
      // ticket atribuido em outra pagina/sessao nao desaparece do admin.
      if (shouldMergeRecentQueueSnapshot(queue_type, parseResult.data.cursor, searchTerm)) {
        const recentSince = new Date(Date.now() - 15 * 60_000).toISOString();
        const { data: catalogRows, error: recentError } = await supabase.from('queue_ticket_catalog')
          .select('ticket_id, ticket_snapshot').eq('queue_type', queue_type)
          .gte('verified_at', recentSince).order('verified_at', { ascending: false }).limit(250);
        if (recentError) throw new Error(`Falha ao ler catalogo da fila: ${recentError.message}`);
        const recentIds = (catalogRows || []).map(row => row.ticket_id);
        if (recentIds.length === 0) {
          if (caller.role === 'qualidade') visibleTickets = [];
        } else {
          let assignmentQuery = supabase.from('queue_ticket_assignments')
            .select('ticket_id, assigned_to').eq('queue_type', queue_type).in('ticket_id', recentIds);
          if (caller.role === 'qualidade') assignmentQuery = assignmentQuery.eq('assigned_to', user.id);
          const { data: assignedRows, error: assignedError } = await assignmentQuery;
          if (assignedError) throw new Error(`Falha ao autorizar leitura da fila: ${assignedError.message}`);
          const allowedIds = new Set((assignedRows || []).map(row => row.ticket_id));
          const merged = new Map(visibleTickets.map(ticket => [ticket.ticket_id, ticket]));
          for (const row of catalogRows || []) {
            if (allowedIds.has(row.ticket_id) && row.ticket_snapshot && typeof row.ticket_snapshot === 'object'
              && ticketCanReceiveEvaluation(row.ticket_snapshot, queue_type)) {
              merged.set(row.ticket_id, row.ticket_snapshot);
            }
          }
          const mergedIds = [...merged.keys()];
          if (mergedIds.length === 0) {
            visibleTickets = [];
          } else {
            const { data: completedRows, error: completedError } = await supabase.from('monitorias')
              .select('ticket_id').in('ticket_id', mergedIds);
            if (completedError) throw new Error('Falha ao validar o estado atual da fila.');
            const completedIds = new Set((completedRows || []).map(row => row.ticket_id));
            visibleTickets = [...merged.values()].filter(ticket => !completedIds.has(ticket.ticket_id));
          }
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
        .select('id, name, role, primary_team_id')
        .eq('email', assignee.email.trim().toLowerCase())
        .maybeSingle();
      const groupLink = await resolveZendeskTicketGroup(supabase, group?.id, group?.name);
      const ticketGroupTeamId = groupLink?.id || null;

      return jsonResponse({
        success: true,
        agent: {
          name: assignee.name,
          email: assignee.email,
          team_name: group?.name,
          channel: t?.via?.channel,
          existing_id: existing?.id || null,
          existing_team_id: existing?.primary_team_id || groupLink?.team_id || null,
          ticket_group_team_id: ticketGroupTeamId,
        },
      }, 200);
    }

    // 5.1 Busca completa de um ticket no Zendesk por ID para o fluxo de "Nova Monitoria"
    // Retorna todos os metadados necessários para exibir o card de resumo
    // e permite ao auditor escolher entre avaliação com IA ou manual.
    // Também cataloga temporariamente o ticket no banco para garantir que as
    // etapas subsequentes de IA passem na checagem de integridade.
    if (action === 'lookup_ticket') {
      if (!ticket_id || !/^\d+$/.test(ticket_id)) {
        return jsonResponse({ error: 'ticket_id numérico é obrigatório para lookup_ticket' }, 400);
      }

      const ticketUrl = `https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}.json?include=users,groups,organizations`;
      const response = await fetch(ticketUrl, { headers: zendeskHeaders });

      if (response.status === 404) {
        return jsonResponse({ success: true, found: false, message: 'Ticket não encontrado no Zendesk.' }, 200);
      }
      if (!response.ok) {
        throw new Error(`Zendesk Ticket API falhou (${response.status}).`);
      }

      const ticketData = await response.json();
      const t = ticketData.ticket;
      if (!t) {
        return jsonResponse({ success: true, found: false, message: 'Ticket não encontrado no Zendesk.' }, 200);
      }

      const usersList = ticketData.users || [];
      const groupsList = ticketData.groups || [];
      const orgsList = ticketData.organizations || [];

      const assignee = usersList.find((u: any) => u.id === t?.assignee_id);
      const requester = usersList.find((u: any) => u.id === t?.requester_id);
      const group = groupsList.find((g: any) => g.id === t?.group_id);
      const org = orgsList.find((o: any) => o.id === t?.organization_id);

      let existingAgent: any = null;
      if (assignee?.email) {
        const { data: foundUser } = await supabase
          .from('users')
          .select('id, name, email, role, primary_team_id, active')
          .eq('email', assignee.email.trim().toLowerCase())
          .maybeSingle();
        existingAgent = foundUser;
      }

      const groupLink = await resolveZendeskTicketGroup(supabase, group?.id, group?.name);
      const ticketGroupTeamId = groupLink?.id || null;
      const matchedTeamId = existingAgent?.primary_team_id || groupLink?.team_id || null;

      const csatScore = t.satisfaction_rating?.score;
      const isNegative = csatScore === 'bad' || csatScore === 'bad_with_comment';
      const isPositive = csatScore === 'good' || csatScore === 'good_with_comment';
      const queueTypeForCatalog = isNegative ? 'negativas' : isPositive ? 'positivas' : 'proativas';

      try {
        await supabase.from('queue_ticket_catalog').upsert({
          ticket_id: String(t.id),
          queue_type: queueTypeForCatalog,
          verified_at: new Date().toISOString(),
          ticket_snapshot: {
            id: t.id,
            subject: t.subject || '(Sem assunto)',
            created_at: t.created_at,
            channel: t.via?.channel || 'chat',
            assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
            group: group ? { id: group.id, name: group.name } : null,
          }
        });
      } catch (catErr) {
        console.warn('[helpdesk-queue] Aviso ao catalogar ticket:', catErr);
      }

      return jsonResponse({
        success: true,
        found: true,
        ticket: {
          ticket_id: String(t.id),
          subject: t.subject || '(Sem assunto)',
          description: t.description || '',
          status: t.status,
          channel: t.via?.channel,
          created_at: t.created_at,
          satisfaction_rating: t.satisfaction_rating ? {
            score: t.satisfaction_rating.score,
            comment: t.satisfaction_rating.comment,
          } : null,
          satisfaction_result: csatStatusToSatisfactionResult(csatScore),
          tags: Array.isArray(t.tags) ? t.tags : [],
          agent: assignee ? {
            id: assignee.id,
            name: assignee.name,
            email: assignee.email,
          } : null,
          requester: requester ? {
            id: requester.id,
            name: requester.name,
            email: requester.email,
          } : null,
          organization_name: org?.name || null,
          group_name: group?.name || null,
          ticket_group_team_id: ticketGroupTeamId,
          matched_agent: existingAgent ? {
            id: existingAgent.id,
            name: existingAgent.name,
            email: existingAgent.email,
            primary_team_id: existingAgent.primary_team_id,
            team_ids: existingAgent.primary_team_id ? [existingAgent.primary_team_id] : [],
          } : null,
          matched_team_id: matchedTeamId,
        }
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
  evaluationType: 'atendimento' | 'chamado_filho' | 'registro_auditor',
  ticketId: string,
  jobId: string | undefined,
  record: AIAttemptRecord,
): void {
  const details = {
    event: record.status === 'success' ? 'model_succeeded' : 'model_failed',
    evaluation_type: evaluationType,
    ticket_id: ticketId,
    job_id: jobId || null,
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
  if (!Array.isArray(parsed.checks) || parsed.checks.length !== 3 || !parsed.checks.every((check: any) =>
    check && typeof check.rule === 'string' && typeof check.passed === 'boolean' && typeof check.details === 'string')) {
    incompleteResponse('O parecer não contém os três checks obrigatórios completos.');
  }
  if (parsed.checks.some((check: { rule: string; details: string }) => /\btag(s)?\b/i.test(`${check.rule} ${check.details}`))) {
    incompleteResponse('O parecer não deve avaliar tags dos chamados filhos.');
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

async function setAIPhase(supabase: SupabaseClient, jobId: string, phase: 'running_gemma' | 'running_glm' | 'fallback_gemini' | 'retry_pending'): Promise<void> {
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
      evaluationType?: string; promptText?: string; sanitizedDialogue?: string;
    } | undefined;
    if (technical) {
      await enrichGenerationMetadata(technical.attempts?.at(-1));
      const clientSelection = payload.draft_meta?.selection_context;
      const actualFormId = payload.draft_meta?.form_id || null;
      const actualGuidelineIds = payload.guideline_ids || payload.draft_meta?.guideline_ids || [];
      const sameGuidelines = clientSelection
        ? [...clientSelection.selected_guideline_ids].sort().join(',') === [...actualGuidelineIds].sort().join(',')
        : false;
      const normalizedSelection = clientSelection ? {
        ...clientSelection,
        selected_form_id: actualFormId,
        selected_form_title: clientSelection.selected_form_id === actualFormId ? clientSelection.selected_form_title : null,
        selected_guideline_ids: actualGuidelineIds,
        selected_guideline_titles: sameGuidelines ? clientSelection.selected_guideline_titles : [],
        overridden: clientSelection.suggested_form_id !== actualFormId ||
          [...clientSelection.suggested_guideline_ids].sort().join(',') !== [...actualGuidelineIds].sort().join(','),
        source: clientSelection.suggested_form_id !== actualFormId ||
          [...clientSelection.suggested_guideline_ids].sort().join(',') !== [...actualGuidelineIds].sort().join(',')
          ? 'manual_override' : 'automatic',
        integrity: 'server_normalized',
      } : null;
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
        prompt_text: technical.promptText,
        sanitized_dialogue: technical.sanitizedDialogue,
        response_json: result,
        selection_context: normalizedSelection,
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

async function handleGenerateAuditorRecord(
  payload: z.infer<typeof RequestSchema>,
  supabase: SupabaseClient,
  callerId: string,
  signal?: AbortSignal,
): Promise<Response> {
  const { ticket_id, form_criteria, evaluation_context } = payload;
  if (!ticket_id || !form_criteria?.sections || !evaluation_context) {
    return jsonResponse({ error: 'Ticket, ficha e contexto da avaliação são obrigatórios.' }, 400);
  }

  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!openRouterApiKey) {
    return jsonResponse({ error: 'OPENROUTER_API_KEY não configurada no Supabase Secrets' }, 500);
  }

  const sanitizedObservations = Object.fromEntries(
    Object.entries(evaluation_context.observations)
      .map(([id, value]) => [id, sanitizeMessageBody(value).slice(0, 5000)])
      .filter(([, value]) => value.trim()),
  );
  const sanitizedCriticalObservations = Object.fromEntries(
    Object.entries(evaluation_context.critical_error_observations)
      .map(([id, value]) => [id, sanitizeMessageBody(value).slice(0, 5000)])
      .filter(([, value]) => value.trim()),
  );
  const hasSanitizedObservation = Object.keys(sanitizedObservations).length > 0
    || Object.entries(evaluation_context.critical_errors).some(([id, selected]) =>
      selected && !!sanitizedCriticalObservations[id]?.trim(),
    );
  if (!hasSanitizedObservation) {
    return jsonResponse({ error: 'Adicione ao menos uma observação válida antes de gerar o registro.' }, 400);
  }
  const prompt = buildAuditorRecordPrompt({
    ticketId: ticket_id,
    score: evaluation_context.score,
    sections: form_criteria.sections.map(section => ({
      title: sanitizeMessageBody(section.title),
      questions: section.questions.map(question => ({
        id: question.id,
        text: sanitizeMessageBody(question.text),
      })),
    })),
    criticalErrorQuestions: (form_criteria.critical_errors || []).map(question => ({
      id: question.id,
      text: sanitizeMessageBody(question.text),
    })),
    answers: evaluation_context.answers,
    observations: sanitizedObservations,
    criticalErrors: evaluation_context.critical_errors,
    criticalErrorObservations: sanitizedCriticalObservations,
  });
  const responseSchema = {
    type: 'object',
    properties: {
      auditor_record: {
        type: 'string',
        maxLength: 3000,
        description: 'Novo Registro do Auditor em um único parágrafo profissional.',
      },
    },
    required: ['auditor_record'],
    additionalProperties: false,
  };
  const startedAt = Date.now();
  let attempts: AIAttemptRecord[] = [];

  try {
    const chain = await runAIModelChain({
      targets: AI_TARGETS,
      signal,
      execute: async (target, _attempt, attemptSignal) => {
        const response = await callOpenRouter({
          prompt,
          responseSchema,
          apiKey: openRouterApiKey,
          model: target.model,
          maxTokens: 700,
          signal: attemptSignal,
        });
        return {
          value: parseAuditorRecordResponse(parseModelJSON(response.text)),
          actualModel: target.model,
          routedProvider: response.routedProvider,
          routerAttempt: response.routerAttempt,
          requestId: response.requestId,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          cost: response.cost,
        };
      },
      onAttempt: record => logAIAttempt('registro_auditor', ticket_id, undefined, record),
    });
    attempts = chain.attempts;
    await enrichGenerationMetadata(attempts.at(-1));

    const result = { auditor_record: chain.value };
    const { error: logError } = await supabase.from('ai_evaluation_logs').insert({
      ticket_id,
      ticket_subject: `Ticket #${ticket_id}`,
      evaluation_type: 'registro_auditor',
      provider: 'openrouter',
      model: chain.model,
      duration_ms: Date.now() - startedAt,
      status: 'success',
      attempts,
      fallback_used: chain.fallbackUsed,
      prompt_text: prompt,
      response_json: result,
      created_by: callerId,
    });
    if (logError) console.warn('[auditor-record] Falha ao registrar metadados:', logError.message);

    return jsonResponse({ success: true, result }, 200);
  } catch (error) {
    attempts = attemptsFromError(error);
    const message = error instanceof Error ? error.message : 'Falha ao gerar o Registro do Auditor.';
    await supabase.from('ai_evaluation_logs').insert({
      ticket_id,
      ticket_subject: `Ticket #${ticket_id}`,
      evaluation_type: 'registro_auditor',
      provider: 'openrouter',
      model: attempts.at(-1)?.model || OPENROUTER_MODEL,
      duration_ms: Date.now() - startedAt,
      status: 'error',
      attempts,
      fallback_used: false,
      prompt_text: prompt,
      error_message: message.slice(0, 500),
      created_by: callerId,
    });
    return jsonResponse({ error: message }, 502);
  }
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
      onTargetStart: async target => setAIPhase(supabase, payload.job_id!, phaseForAIModel(target.model)),
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

    const canonicalScore = calculateCanonicalQualityScore(
      form_criteria.sections,
      suggested_answers as Record<string, 'SIM' | 'NAO' | 'NA'>,
      suggested_critical_errors,
    );
    const scoreDelta = Number((canonicalScore - parsed.score).toFixed(2));
    console.info(`[ai-score] ${JSON.stringify({
      event: 'score_reconciled',
      ticket_id: String(ticket_id),
      job_id: payload.job_id,
      model_reported_score: parsed.score,
      calculated_score: canonicalScore,
      score_delta: scoreDelta,
    })}`);

    return jsonResponse({
      success: true,
      technical: { model: chain.model, attempts: chain.attempts, fallbackUsed: chain.fallbackUsed, durationMs, evaluationType: 'atendimento', callerId, promptText: prompt, sanitizedDialogue: dialogueText, modelReportedScore: parsed.score, calculatedScore: canonicalScore, scoreDelta },
      result: {
        score: canonicalScore,
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
        prompt_text: prompt,
        sanitized_dialogue: dialogueText,
        selection_context: payload.draft_meta?.selection_context ? {
          ...payload.draft_meta.selection_context,
          selected_form_id: payload.draft_meta.form_id || null,
          selected_guideline_ids: payload.guideline_ids || payload.draft_meta.guideline_ids || [],
          integrity: 'server_normalized',
        } : null,
        error_stage: 'provider_or_parse',
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
  const { ticket_id, ticket_subject, ticket_status, dialogue, ticket_fields, macro_type } = payload;

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
            details: { type: 'string', description: 'Justificativa objetiva baseada no assunto, texto e direcionamento' }
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
1. ASSUNTO DA ABERTURA E ALTERAÇÃO AUTOMÁTICA NA RESOLUÇÃO:
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
- EXCEÇÃO OBRIGATÓRIA: A macro de resolvido do Zendesk altera automaticamente o assunto depois da abertura. Se o ticket estiver resolvido e o assunto atual não contiver mais o nome da macro de abertura, considere o quesito do assunto CONFORME (passed: true), salvo se houver evidência clara de que o analista alterou manualmente o assunto antes da resolução. Não reprove nem reduza a nota somente por essa alteração automática. Explique no check que o título atual reflete a macro de resolvido.
- QUANDO DEVE FALHAR (passed: false): Se não houver indicação de resolução e o assunto da abertura tiver sido descaracterizado manualmente e substituído por texto livre sem nenhuma macro homologada (ex: "Erro no PDV", "Cliente com dúvida", "Impressora travada").

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

DADOS DO CHAMADO FILHO SOB AUDITORIA:
- Ticket: #${ticket_id}
- Assunto Registrado: ${sanitizeMessageBody(ticket_subject || 'Não informado')}
- Status Atual do Ticket: ${sanitizeMessageBody(ticket_status || 'Não informado')}
- Tipo Sugerido/Macro: ${macro_type || 'Detectar automaticamente'}
- Campos do Ticket:
${ticketFieldsText || '(nenhum campo extra)'}

CONTEÚDO / DESCRIÇÃO / COMENTÁRIOS DO TICKET FILHO:
${dialogueText || '(sem texto registrado)'}

CHECKS OBRIGATÓRIOS QUE DEVEM CONSTAR NA RESPOSTA:
1. rule: "Assunto da Abertura e Macro de Resolvido"
2. rule: "Preservação do Texto da Macro"
3. rule: "Direcionamento Correto ('Para')"

Não avalie a presença, ausência ou preservação de tags. Elas são geridas pela automação do Zendesk e não compõem o parecer de qualidade.

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
      onTargetStart: async target => setAIPhase(supabase, payload.job_id!, phaseForAIModel(target.model)),
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
    return jsonResponse({ success: true, technical: { model: chain.model, attempts: chain.attempts, fallbackUsed: chain.fallbackUsed, durationMs, evaluationType: 'chamado_filho', callerId, promptText: prompt, sanitizedDialogue: dialogueText }, result: parsed }, 200);
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
        prompt_text: prompt,
        sanitized_dialogue: dialogueText,
        error_stage: 'provider_or_parse',
        created_by: callerId || null,
      });
    } catch (_) {}
    return jsonResponse({
      error: err.message || 'Falha ao avaliar chamado filho',
      retryable: err instanceof AIModelError && err.retryable,
    }, 502);
  }
}
