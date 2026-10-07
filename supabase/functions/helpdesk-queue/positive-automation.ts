import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import {
  buildZendeskParticipantRoles, classifyTranscriptMessage, isChatTranscript,
  parseZendeskChatTranscript, sanitizeDialogue, sanitizeMessageBody, zendeskParticipantRole,
} from './sanitizer.ts';

type Json = Record<string, unknown>;
type DialogueMessage = { id: string | number; author_name: string; author_role: 'agent' | 'end_user' | 'system' | 'unknown'; created_at: string; body: string; is_public: boolean };
type ZendeskUser = { id: number; name?: string; email?: string; role?: string };
type ZendeskOrganization = { id: number; name?: string; tags?: string[] };
type ZendeskTicket = {
  id: number; subject?: string; status?: string; created_at?: string; updated_at?: string;
  assignee_id?: number; organization_id?: number; group_id?: number; tags?: string[];
  via?: { channel?: string }; satisfaction_rating?: { score?: string; comment?: string };
  custom_fields?: Array<{ id: number; value: unknown }>;
};
type ZendeskBody = {
  ticket?: ZendeskTicket; tickets?: ZendeskTicket[]; users?: ZendeskUser[];
  user?: ZendeskUser; organizations?: ZendeskOrganization[]; organization?: ZendeskOrganization;
  groups?: Array<{ id: number; name?: string }>;
  next_page?: string | null; meta?: { has_more?: boolean }; links?: { next?: string | null };
  comments?: Array<{ id: number; author_id: number; created_at: string; body?: string; html_body?: string; public?: boolean }>;
  ticket_fields?: Array<{ id: number; title: string; active?: boolean; custom_field_options?: Array<{ value: string; name: string }> }>;
};
type Form = { id: string; title: string; active: boolean; sections: Array<{ weight?: number; questions?: Array<{ id: string; text: string }> }> };
type Guideline = { id: string; title: string; active: boolean };
type Work = { ticket_id: string; ticket_snapshot: Json; auditor_id: string; lease_id: string; attempts: number };
type Config = { id: boolean; enabled: boolean; auditor_id: string; capture_cursor: string | null; capture_lease_id: string };

export function selectPositiveAIForm(tags: string[], forms: Form[], guidelines: Guideline[]) {
  const normalized = tags.map(tag => tag.toLowerCase().trim());
  const revenda = normalized.some(tag => tag.includes('revenda'));
  const final = normalized.some(tag => /cliente[ _-]?final|^final$/.test(tag));
  if (revenda && final) throw new Error('Tipo de cliente ambíguo; confira as tags antes da avaliação automática.');
  if (!revenda && !final) throw new Error('Tipo de cliente não identificado; confira as tags e selecione a ficha manualmente.');
  const type = revenda ? 'revenda' : 'cliente_final';
  const title = revenda ? /revenda/i : /cliente.*final/i;
  const eligibleForms = forms.filter(form => form.active && title.test(form.title));
  const eligibleGuidelines = guidelines.filter(guideline => guideline.active && title.test(guideline.title));
  if (eligibleForms.length !== 1 || eligibleGuidelines.length !== 1) {
    throw new Error('Ficha ou manual ausente/ambíguo para o tipo de cliente; seleção manual necessária.');
  }
  const form = eligibleForms[0];
  if (!Array.isArray(form.sections) || form.sections.length === 0 || form.sections.some(section =>
    !Number.isFinite(section.weight) || (section.weight || 0) <= 0 || !section.questions?.length)) {
    throw new Error('Ficha sem critérios e pesos válidos para avaliação automática.');
  }
  return { type, form, guideline: eligibleGuidelines[0] };
}

export function positiveCursor(candidate: string, origin: string, path: string): string {
  const url = new URL(candidate);
  if (url.origin !== origin || url.pathname !== path || url.username || url.password || url.hash) {
    throw new Error('Paginação do Zendesk inválida.');
  }
  return url.href;
}

export function positiveChannel(raw: string | undefined): 'Chat' | 'Email' | 'Telefone' | 'WhatsApp' {
  const channel = raw?.toLowerCase().trim() || '';
  if (channel.includes('whatsapp')) return 'WhatsApp';
  if (channel.includes('mail')) return 'Email';
  if (/voice|phone|telefone|call/.test(channel)) return 'Telefone';
  if (['chat','native_messaging','messaging','web'].includes(channel)) return 'Chat';
  throw new Error('Canal do atendimento não identificado; revisão manual necessária.');
}

function snapshot(ticket: ZendeskTicket, body: ZendeskBody, origin: string): Json {
  const agent = body.users?.find(user => user.id === ticket.assignee_id);
  const organization = body.organizations?.find(org => org.id === ticket.organization_id);
  return {
    ticket_id: String(ticket.id), subject: ticket.subject || 'Sem assunto', status: ticket.status || 'solved',
    channel: ticket.via?.channel || 'chat', ticket_date: ticket.created_at || null,
    zendesk_updated_at: ticket.updated_at || null, csat_status: 'good', csat_comment: ticket.satisfaction_rating?.comment,
    agent_name: agent?.name, agent_email: agent?.email, zendesk_assignee_id: ticket.assignee_id,
    group_name: body.groups?.find(group => group.id === ticket.group_id)?.name,
    organization_id: ticket.organization_id, organization_name: organization?.name,
    organization_tags: organization?.tags || [], tags: ticket.tags || [],
    url: `${origin}/agent/tickets/${ticket.id}`, automatic_positive: true,
  };
}

async function requireWrite(query: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await query;
  if (error) throw new Error(error.message);
}

/** One captured view page and one AI item per invocation. Cursor and leases make
 * overlapping cron invocations safe; ticket closure never changes queue membership. */
export async function processPositiveAI(
  db: SupabaseClient,
  env: (key: string) => string | undefined,
  execute: (payload: Json, auditorId: string) => Promise<Response>,
  fetcher: typeof fetch = fetch,
): Promise<Json> {
  const { data: configured, error: configError } = await db.from('positive_ai_config').select('enabled,auditor_id').eq('id', true).maybeSingle();
  if (configError) throw configError;
  if (!configured?.enabled) return { enabled: false, processed: 0 };
  const subdomain = env('ZENDESK_SUBDOMAIN');
  const email = env('ZENDESK_EMAIL');
  const apiToken = env('ZENDESK_API_TOKEN');
  if (!subdomain || !/^[a-z0-9-]+$/i.test(subdomain) || !email || !apiToken || !env('OPENROUTER_API_KEY')) {
    await requireWrite(db.from('positive_ai_config').update({ last_error: 'Configure as credenciais Zendesk e OpenRouter para ativar a avaliação automática.' }).eq('id', true));
    return { enabled: true, blocked: 'missing_credentials', processed: 0 };
  }
  const origin = `https://${subdomain}.zendesk.com`;
  const headers = { Authorization: `Basic ${btoa(`${email}/token:${apiToken}`)}`, Accept: 'application/json' };
  const read = async (url: string): Promise<ZendeskBody> => {
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Zendesk indisponível (${response.status}); nova tentativa será agendada.`);
    return await response.json();
  };
  const { data: leases, error: scanError } = await db.rpc('claim_positive_ai_scan');
  if (scanError) throw scanError;
  const config = (leases || [])[0] as Config | undefined;
  let captured = 0;
  if (config) {
    try {
      const viewId = env('HELPDESK_POSITIVE_VIEW_ID') || '48318855861396';
      if (!/^\d+$/.test(viewId)) throw new Error('View positiva inválida.');
      const path = `/api/v2/views/${viewId}/tickets.json`;
      const url = config.capture_cursor ? positiveCursor(config.capture_cursor, origin, path)
        : `${origin}${path}?include=users,groups,organizations&page[size]=100`;
      const page = await read(url);
      if (!Array.isArray(page.tickets)) throw new Error('A view não retornou uma lista de tickets válida.');
      const tickets = page.tickets.filter(ticket => Number.isSafeInteger(ticket.id) && ticket.id > 0
        && ['good', 'good_with_comment'].includes(ticket.satisfaction_rating?.score || ''));
      if (tickets.length) {
        await requireWrite(db.from('queue_ticket_catalog').upsert(tickets.map(ticket => ({
          ticket_id: String(ticket.id), queue_type: 'positivas', verified_at: new Date().toISOString(),
          ticket_snapshot: snapshot(ticket, page, origin),
        })), { onConflict: 'ticket_id,queue_type' }));
        captured = tickets.length;
      }
      const candidate = page.meta?.has_more ? page.links?.next : page.next_page;
      if (page.meta?.has_more && !candidate) throw new Error('A view sinalizou mais páginas sem fornecer cursor.');
      await requireWrite(db.from('positive_ai_config').update({
        capture_cursor: candidate ? positiveCursor(candidate, origin, path) : null,
        capture_lease_until: null, last_capture_at: new Date().toISOString(), last_error: null,
      }).eq('id', true).eq('capture_lease_id', config.capture_lease_id));
    } catch (error) {
      await requireWrite(db.from('positive_ai_config').update({
        capture_cursor: null, capture_lease_until: null, last_error: error instanceof Error ? error.message : 'Falha ao capturar positivas.',
      }).eq('id', true).eq('capture_lease_id', config.capture_lease_id));
      // Retained tickets can still be processed if the live view is unavailable.
    }
  }
  const { data: workRows, error: claimError } = await db.rpc('claim_positive_ai_work');
  if (claimError) throw claimError;
  const work = (workRows || [])[0] as Work | undefined;
  if (!work) return { enabled: true, captured, processed: 0 };
  try {
    const ticketPath = `/api/v2/tickets/${work.ticket_id}.json`;
    const ticketBody = await read(`${origin}${ticketPath}?include=users,groups,organizations`);
    const ticket = ticketBody.ticket;
    if (!ticket || String(ticket.id) !== work.ticket_id) throw new Error('Ticket não disponível para preparação da ficha.');
    if (!ticket.created_at || !/^\d{4}-\d{2}-\d{2}T/.test(ticket.created_at) || !Number.isFinite(Date.parse(ticket.created_at))) {
      throw new Error('Data do ticket inválida; revisão manual necessária.');
    }
    const channel = positiveChannel(ticket.via?.channel);
    if (!['good', 'good_with_comment'].includes(ticket.satisfaction_rating?.score || '')) {
      throw new Error('A pesquisa deixou de ser positiva; revisão manual necessária.');
    }
    let agent = ticketBody.users?.find(user => user.id === ticket.assignee_id);
    if (!agent && ticket.assignee_id) agent = (await read(`${origin}/api/v2/users/${ticket.assignee_id}.json`)).user;
    if (!agent?.email) throw new Error('Atendente sem e-mail verificado no Zendesk; vincule o agente manualmente.');
    const { data: user, error: userError } = await db.from('users').select('id,name,email,primary_team_id')
      .eq('active', true).eq('role', 'suporte').ilike('email', agent.email.trim()).maybeSingle();
    if (userError || !user?.primary_team_id || user.email?.trim().toLowerCase() !== agent.email.trim().toLowerCase()) {
      throw new Error('Agente ativo ou equipe de gestão não identificado; confira o cadastro.');
    }
    let organization = ticketBody.organizations?.find(org => org.id === ticket.organization_id);
    if (!organization && ticket.organization_id) organization = (await read(`${origin}/api/v2/organizations/${ticket.organization_id}.json`)).organization;
    const [{ data: forms, error: formError }, { data: guidelines, error: guidelineError }, { data: team, error: teamError }] = await Promise.all([
      db.from('forms').select('*').eq('active', true),
      db.from('ai_evaluation_guidelines').select('id,title,active').eq('active', true),
      db.from('teams').select('name').eq('id', user.primary_team_id).eq('active',true).single(),
    ]);
    if (formError || guidelineError || teamError) throw new Error('Não foi possível carregar ficha, manual ou equipe.');
    const selected = selectPositiveAIForm([...(ticket.tags || []), ...(organization?.tags || [])], forms || [], guidelines || []);
    const comments: NonNullable<ZendeskBody['comments']> = [];
    const users = new Map<number, ZendeskUser>((ticketBody.users || []).map(item => [item.id, item]));
    users.set(agent.id, agent);
    const commentPath = `/api/v2/tickets/${work.ticket_id}/comments.json`;
    let next: string | null = `${origin}${commentPath}?include=users&per_page=100`;
    for (let pageNumber = 0; next && pageNumber < 10; pageNumber++) {
      const page: ZendeskBody = await read(next);
      if (!Array.isArray(page.comments)) throw new Error('Transcrição incompleta; avaliação automática interrompida.');
      comments.push(...page.comments);
      for (const person of page.users || []) users.set(person.id, person);
      const candidate: string | null | undefined = page.meta?.has_more ? page.links?.next : page.next_page;
      if (page.meta?.has_more && !candidate) throw new Error('Paginação da transcrição incompleta.');
      next = candidate ? positiveCursor(candidate, origin, commentPath) : null;
    }
    if (next) throw new Error('Transcrição excede o limite de captura; revisão manual necessária.');
    const participants = buildZendeskParticipantRoles([...users.values()]);
    const dialogue = comments.flatMap<DialogueMessage>(comment => {
      const body = comment.body || comment.html_body || '';
      if (isChatTranscript(body)) return parseZendeskChatTranscript(body, {
        parentDate: comment.created_at, parentId: comment.id, isPublic: comment.public !== false,
      }).map(message => ({ ...classifyTranscriptMessage(message, participants), body: sanitizeMessageBody(message.body) }));
      const author = users.get(comment.author_id);
      return [{ id: comment.id, author_name: author?.name || 'Autor não identificado',
        author_role: zendeskParticipantRole(author?.role) || 'unknown', created_at: comment.created_at,
        body: sanitizeMessageBody(body), is_public: comment.public !== false }];
    }).filter(comment => comment.body.trim()).sort((a,b) => a.created_at.localeCompare(b.created_at));
    if (!dialogue.length || !dialogue.some(comment => comment.author_role === 'agent')
      || !dialogue.some(comment => comment.author_role === 'end_user')) {
      throw new Error('Transcrição sem identificação segura de cliente e atendente; revisão manual necessária.');
    }
    if (dialogue.length > 500 || sanitizeDialogue(dialogue).length > 250_000) {
      throw new Error('Transcrição excede o limite de avaliação; revisão manual necessária.');
    }
    const fieldBody = await read(`${origin}/api/v2/ticket_fields.json`);
    const fieldDefinitions = new Map((fieldBody.ticket_fields || []).map(field => [field.id, field]));
    const ticketFields = (ticket.custom_fields || []).flatMap(field => {
      const definition = fieldDefinitions.get(field.id);
      if (!definition || definition.active === false || field.value === null || field.value === false || field.value === '') return [];
      const value = definition.custom_field_options?.find(option => option.value === field.value)?.name
        || (Array.isArray(field.value) ? field.value.join(', ') : String(field.value));
      return [{ title: definition.title.slice(0,300), value: sanitizeMessageBody(value).slice(0,4000) }];
    }).slice(0,100);
    const enriched = { ...work.ticket_snapshot, ...snapshot(ticket, { ...ticketBody, users: [agent], organizations: organization ? [organization] : [] }, origin),
      agent_name: user.name, agent_email: user.email, agent_id: user.id, team_id: user.primary_team_id,channel,
      dialogue, ticket_fields: ticketFields };
    await requireWrite(db.from('positive_ai_queue').update({ ticket_snapshot: enriched }).eq('ticket_id',work.ticket_id).eq('lease_id',work.lease_id));
    await requireWrite(db.from('queue_ticket_catalog').upsert({ ticket_id: work.ticket_id,queue_type:'positivas',ticket_snapshot: enriched,
      verified_at: new Date().toISOString() },{onConflict:'ticket_id,queue_type'}));
    const payload: Json = {
      action: 'evaluate_ai',ticket_id:work.ticket_id,form_criteria:selected.form,dialogue,
      agent_info:{name:user.name,email:user.email,team_name:team.name,channel},
      guideline_ids:[selected.guideline.id],ticket_fields:ticketFields,
      draft_meta:{source_queue:'positivas',form_id:selected.form.id,agent_id:user.id,agent_name:user.name,agent_email:user.email,
        team_id:user.primary_team_id,channel,satisfaction_comment:ticket.satisfaction_rating?.comment || '',
        guideline_ids:[selected.guideline.id]},
    };
    const { data: jobId, error: startError } = await db.rpc('start_positive_ai_job', {
      p_ticket_id:work.ticket_id,p_lease_id:work.lease_id,p_payload:payload,p_form_snapshot:selected.form,
    });
    if (startError) throw startError;
    if (!jobId) return { enabled:true,captured,processed:0,skipped:work.ticket_id };
    const response = await execute({...payload,job_id:jobId},work.auditor_id);
    return { enabled:true,captured,processed:1,ticket_id:work.ticket_id,status:response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Only a preparation lease may be released here. Started AI jobs are owned
    // by the durable retry pipeline and must never be restarted by this scanner.
    await requireWrite(db.from('positive_ai_queue').update({ status:'blocked',last_error:message.slice(0,500),lease_until:null,
      next_attempt_at:new Date(Date.now()+Math.min(60,2 ** Math.min(work.attempts,6))*60_000).toISOString(),updated_at:new Date().toISOString(),
    }).eq('ticket_id',work.ticket_id).eq('lease_id',work.lease_id).eq('status','preparing'));
    return { enabled:true,captured,processed:0,blocked:work.ticket_id,error:message };
  }
}
