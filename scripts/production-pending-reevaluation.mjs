#!/usr/bin/env node
// Read production; write only isolated candidates to develop after an explicit --execute.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { questions, withoutLegacyCritical, score } from './production-pending-scoring.mjs';
import { loadPendingModel } from './production-pending-model-config.mjs';

const PRODUCTION = 'vpytvgpsqdapgouyjowc';
const DEVELOP = 'secfejmccojxsvdntljx';
const FORMS = {
  revenda: 'f1fc47e9-6d51-40a5-938e-8108e225195e',
  cliente_final: '8f84cfd0-8a3c-4735-8921-2eef159f094c',
  ticket_filho: '6c7d1e88-841b-4da9-9a66-9f1464ce896f',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const args = process.argv.slice(2);
const execute = args.includes('--execute');
if (execute === args.includes('--preflight')) throw new Error('Use exatamente --preflight ou --execute.');
function option(name, fallback) {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
}
const cursor = option('--cursor', null);
const limit = Number(option('--limit', execute ? '10' : '1000'));
if ((cursor && !UUID.test(cursor)) || !Number.isInteger(limit) || limit < 1 || limit > 1000)
  throw new Error('Cursor UUID ou limite inválido (1..1000).');
const sha = value => createHash('sha256').update(value).digest('hex');
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const secretText = process.env.REEVALUATION_SECRET_FILE
  ? readFileSync(process.env.REEVALUATION_SECRET_FILE, 'utf8') : '';
const tokens = [...new Set([process.env.SUPABASE_PRODUCTION_ACCESS_TOKEN, process.env.SUPABASE_DEVELOP_ACCESS_TOKEN,
  process.env.SUPABASE_ACCESS_TOKEN, ...secretText.matchAll(/sbp_[A-Za-z0-9_-]+/g)].map(value =>
    typeof value === 'string' ? value : value?.[0]).filter(Boolean))];
const openrouterKey = process.env.OPENROUTER_API_KEY || secretText.match(/sk-or-v1-[A-Za-z0-9_-]+/)?.[0];
if (!tokens.length) throw new Error('Credencial da Management API indisponível.');
const projectToken = new Map();
const zendeskText = process.env.ZENDESK_ENV_FILE ? readFileSync(process.env.ZENDESK_ENV_FILE, 'utf8') : '';
const zendeskFileEnv = Object.fromEntries(zendeskText.split(/\r?\n/).map(line =>
  line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(match => [match[1], match[2].replace(/^['"]|['"]$/g, '')]));
const zendeskEnv = Object.fromEntries(['ZENDESK_SUBDOMAIN', 'ZENDESK_EMAIL', 'ZENDESK_API_TOKEN']
  .map(key => [key, process.env[key] || zendeskFileEnv[key]]));

async function sql(project, query, writable = false) {
  if (project === PRODUCTION && writable) throw new Error('Escrita em production proibida.');
  if (!writable && !/^\s*SELECT\b/i.test(query)) throw new Error('Consulta de leitura deve iniciar com SELECT.');
  const candidates = projectToken.has(project) ? [projectToken.get(project)] : tokens;
  for (const candidate of candidates) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${candidate}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }), signal: AbortSignal.timeout(45_000),
    });
    if ([401, 403].includes(response.status) && !projectToken.has(project)) continue;
    if (!response.ok) throw new Error(`${project === PRODUCTION ? 'production' : 'develop'} SQL HTTP ${response.status}`);
    projectToken.set(project, candidate);
    const result = await response.json();
    if (!Array.isArray(result)) throw new Error('Resposta SQL inesperada.');
    return result;
  }
  throw new Error(`${project === PRODUCTION ? 'production' : 'develop'} Management API sem credencial autorizada.`);
}
async function zendesk(path) {
  const { ZENDESK_SUBDOMAIN: sub, ZENDESK_EMAIL: email, ZENDESK_API_TOKEN: apiToken } = zendeskEnv;
  if (!/^[a-z0-9-]+$/i.test(sub || '') || !email || !apiToken) throw new Error('Credenciais Zendesk incompletas.');
  const base = `https://${sub}.zendesk.com`;
  const url = new URL(path, base);
  if (url.origin !== base || !url.pathname.startsWith('/api/v2/')) throw new Error('Rota Zendesk não permitida.');
  for (let retry = 0; retry < 4; retry++) {
    const response = await fetch(url, { method: 'GET', headers: {
      Authorization: `Basic ${Buffer.from(`${email}/token:${apiToken}`).toString('base64')}`,
      Accept: 'application/json',
    }, signal: AbortSignal.timeout(30_000) });
    if (response.status === 429 && retry < 3) {
      await wait(Math.max(1000, Math.min(60_000, Number(response.headers.get('retry-after') || 5) * 1000)));
      continue;
    }
    if (!response.ok) throw new Error(`Zendesk GET HTTP ${response.status}.`);
    return response.json();
  }
  throw new Error('Zendesk excedeu rate limit.');
}
async function zendeskComments(ticketId) {
  if (!/^\d+$/.test(ticketId)) throw new Error('Ticket ID inválido.');
  let path = `/api/v2/tickets/${ticketId}/comments.json?per_page=100`;
  const comments = [];
  for (let page = 0; path && page < 20; page++) {
    const body = await zendesk(path);
    comments.push(...(body.comments || []));
    if (comments.length > 2000) throw new Error('Volume Zendesk excede limite.');
    path = body.next_page || null;
  }
  if (path) throw new Error('Paginação Zendesk excedeu 20 páginas.');
  return comments;
}
async function childEvidence(ticketId) {
  const [ticketBody, auditsBody] = await Promise.all([
    zendesk(`/api/v2/tickets/${ticketId}.json`), zendesk(`/api/v2/tickets/${ticketId}/audits.json?per_page=100`),
  ]);
  if (auditsBody.next_page) throw new Error('Histórico filho paginado; revisão manual exigida.');
  const opening = auditsBody.audits?.find(a => a.events?.some(e => e.type === 'Create'));
  const create = opening?.events?.filter(e => e.type === 'Create') || [];
  const field = name => create.find(e => e.field_name === name)?.value;
  const groupId = field('group_id');
  const groupName = groupId ? (await zendesk(`/api/v2/groups/${groupId}.json`)).group?.name : null;
  return { subject: ticketBody.ticket?.subject || '', problem_id: ticketBody.ticket?.problem_id || null,
    creator_id: opening?.author_id || null, initial_assignee_id: field('assignee_id') || null,
    initial_group_name: groupName || null };
}
function kind(row) {
  if (row.form_id === FORMS.ticket_filho || row.ticket_kind === 'chamado_filho') return 'ticket_filho';
  if (row.form_id === FORMS.revenda) return 'revenda';
  if (row.form_id === FORMS.cliente_final) return 'cliente_final';
  throw new Error('Formulário de produção sem mapeamento.');
}
function redact(value, dialogue) {
  let text = String(value || '').slice(0, 3000).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/https?:\/\/\S+/gi, '[url]').replace(/\b(?:\+?\d[\d ().-]{8,}\d)\b/g, '[contato]');
  text = text.replace(/["“][^"”]{15,}["”]/g, '[trecho omitido]');
  for (const message of dialogue) {
    const raw = String(message.body || message.plain_body || '');
    if (raw.length >= 30 && text.includes(raw)) text = text.replaceAll(raw, '[trecho omitido]');
  }
  return text;
}
function validateAnswer(parsed, form, dialogue, child) {
  const list = questions(form);
  if (!parsed || typeof parsed.answers !== 'object' || Array.isArray(parsed.answers)
    || Object.keys(parsed.answers).length !== list.length) throw new Error('Resposta IA incompleta.');
  if (!String(parsed.summary || '').trim() || !String(parsed.auditor_record || '').trim()
    || !Array.isArray(parsed.strengths) || !Array.isArray(parsed.improvements)
    || !Array.isArray(parsed.review_reasons)) throw new Error('Notas IA incompletas.');
  const answers = {}, observations = {};
  for (const q of list) {
    const item = parsed.answers[q.id];
    if (!['SIM', 'NAO', 'NA'].includes(item?.answer) || !String(item?.justification || '').trim())
      throw new Error('Resposta IA inválida.');
    answers[q.id] = item.answer;
    observations[q.id] = redact(item.justification, dialogue);
  }
  if (child) {
    const self = child.creator_id && child.initial_assignee_id
      ? String(child.creator_id) === String(child.initial_assignee_id) : null;
    if ('child-routing-correct' in answers && self !== null) {
      answers['child-routing-correct'] = self ? 'SIM' : 'NAO';
      observations['child-routing-correct'] = self ? 'Abertura confirma autoatribuição.' : 'Abertura indica destinatário diferente do criador.';
    }
    if ('child-creator-authorized' in answers && self && child.initial_group_name) {
      const forbidden = /an[aá]lise t[eé]cnica|an[aá]lise de corre[cç][oõ]es/i.test(child.initial_group_name);
      answers['child-creator-authorized'] = forbidden ? 'NAO' : 'SIM';
      observations['child-creator-authorized'] = forbidden ? 'Grupo inicial pertence a equipe vedada.' : 'Grupo inicial não pertence a equipe vedada.';
    }
  }
  return { suggested_score: score(form, answers), suggested_answers: answers, suggested_observations: observations,
    summary: redact(parsed.summary, dialogue), auditor_note: redact(parsed.auditor_record, dialogue),
    strengths: (parsed.strengths || []).map(x => redact(x, dialogue)),
    improvements: (parsed.improvements || []).map(x => redact(x, dialogue)),
    requires_human_review: true, review_reasons: (parsed.review_reasons || []).map(x => redact(x, dialogue)) };
}
async function budget() {
  if (!openrouterKey) return { remaining: null, status: 'key_missing' };
  const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
    method: 'GET', headers: { Authorization: `Bearer ${openrouterKey}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return { remaining: null, status: `http_${response.status}` };
  const data = (await response.json()).data || {};
  const remaining = data.limit_remaining ?? (data.limit == null ? null : Number(data.limit) - Number(data.usage || 0));
  return { limit: data.limit ?? null, usage: data.usage ?? null, remaining: remaining == null ? null : Number(remaining), status: 'ok' };
}
const totals = await sql(PRODUCTION, `SELECT m.status, m.form_id, m.active, count(*)::int AS n,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.helpdesk_submissions h
    WHERE h.monitoria_id=m.id AND h.status='sent'))::int AS sent
  FROM public.monitorias m GROUP BY m.status,m.form_id,m.active ORDER BY m.status,m.form_id,m.active`);
const scope = totals.filter(r => r.active && r.status === 'pendente_revisao');
const total = scope.reduce((sum, row) => sum + Number(row.n), 0);
if (scope.some(row => !Object.values(FORMS).includes(row.form_id)))
  throw new Error('Há formulário de produção sem mapeamento no escopo.');
const forms = await sql(DEVELOP, `SELECT id,title,sections,critical_errors,active FROM public.forms
  WHERE id IN (${Object.values(FORMS).map(quote).join(',')})`);
const productionForms = await sql(PRODUCTION, `SELECT id,sections,critical_errors FROM public.forms
  WHERE id IN (${Object.values(FORMS).map(quote).join(',')})`);
if (forms.length !== 3 || productionForms.length !== 3) throw new Error('Ficha ausente.');
const formById = new Map(forms.map(f => [f.id, f]));
const formComparison = Object.entries(FORMS).map(([type, id]) => {
  const dev = formById.get(id), prod = productionForms.find(f => f.id === id);
  const devQs = questions(dev), prodQs = questions(prod);
  return { type, form_id: id, develop_active: dev.active,
    develop_questions: devQs.length, production_questions: prodQs.length,
    question_ids_match: JSON.stringify(devQs.map(q => q.id)) === JSON.stringify(prodQs.map(q => q.id)),
    sections_match: sha(JSON.stringify(dev.sections)) === sha(JSON.stringify(prod.sections)),
    sections_match_without_legacy_critical: sha(JSON.stringify(withoutLegacyCritical(dev.sections)))
      === sha(JSON.stringify(withoutLegacyCritical(prod.sections))),
    develop_critical_errors: dev.critical_errors?.length || 0,
    develop_is_critical: devQs.filter(q => q.is_critical).length,
    production_is_critical: prodQs.filter(q => q.is_critical).length };
});
if (formComparison.some(f => !f.develop_active || !f.question_ids_match
  || !f.sections_match_without_legacy_critical || f.develop_critical_errors || f.develop_is_critical))
  throw new Error('Ficha develop ou regras críticas incompatíveis com o lote.');
const guidelines = await sql(DEVELOP, `SELECT id,title,content,updated_at FROM public.ai_evaluation_guidelines
  WHERE active ORDER BY created_at DESC`);
function manualsFor(type, source = guidelines) {
  const pattern = { revenda: /revenda/i, cliente_final: /cliente final/i, ticket_filho: /ticket filho/i }[type];
  return source.filter(manual => pattern.test(manual.title));
}
if (Object.keys(FORMS).some(type => manualsFor(type).length !== 1))
  throw new Error('Mapeamento de manuais develop por tipo inválido.');
const staged = await sql(DEVELOP, `SELECT to_regclass('public.production_pending_reevaluation_candidates') IS NOT NULL AS ready`);
const selectedModel = await loadPendingModel(sql, DEVELOP);
const rows = await sql(PRODUCTION, `SELECT m.id,m.ticket_id,m.status,m.updated_at,m.score,m.form_id,
  m.form_snapshot->'ai_evaluation'->'dialogue' AS stored_dialogue,
  m.form_snapshot->>'ticket_kind' AS ticket_kind,
  EXISTS (SELECT 1 FROM public.helpdesk_submissions h WHERE h.monitoria_id=m.id AND h.status='sent') AS already_sent
  FROM public.monitorias m WHERE m.active AND m.status='pendente_revisao'
  ${cursor ? `AND m.id > ${quote(cursor)}::uuid` : ''} ORDER BY m.id LIMIT ${limit}`);
const budgetInfo = await budget();
if (execute && (!staged[0]?.ready || budgetInfo.status !== 'ok'
  || !Number.isFinite(budgetInfo.remaining) || budgetInfo.remaining <= 0))
  throw new Error('Execução bloqueada: migration develop ausente ou orçamento OpenRouter esgotado.');
const coverage = { stored: 0, zendesk_available: 0, zendesk_missing: 0, zendesk_error: 0,
  stored_and_zendesk: 0, stored_only: 0, zendesk_only: 0, neither: 0 };
const zendeskByTicket = new Map();
for (const row of rows) {
  const stored = Array.isArray(row.stored_dialogue) && row.stored_dialogue.length > 0;
  if (stored) coverage.stored++;
  try {
    const comments = await zendeskComments(String(row.ticket_id));
    zendeskByTicket.set(row.id, comments);
    const available = comments.length > 0;
    if (available) coverage.zendesk_available++; else coverage.zendesk_missing++;
    coverage[stored ? (available ? 'stored_and_zendesk' : 'stored_only')
      : (available ? 'zendesk_only' : 'neither')]++;
  } catch {
    coverage.zendesk_error++;
  }
}
const summary = { production_project: PRODUCTION, develop_project: DEVELOP, mode: execute ? 'execute' : 'preflight',
  baseline_confirmed_2026_10_19: 460, total_active_pending_review: total,
  changed_since_baseline: total !== 460,
  by_status_and_type: totals.map(r => ({ status: r.status, active: r.active,
    type: Object.entries(FORMS).find(([, id]) => id === r.form_id)?.[0] || 'other', count: r.n, sent: r.sent })),
  by_form: scope.map(r => ({ form_id: r.form_id, count: r.n, sent: r.sent })),
  sent_included: scope.reduce((sum, r) => sum + Number(r.sent), 0),
  scanned: rows.length, next_cursor: rows.at(-1)?.id || cursor,
  coverage, forms: formComparison, guidelines: guidelines.map(g => ({ id: g.id, title: g.title,
    content_sha256: sha(g.content) })),
  staging_migration_applied: staged[0]?.ready === true, model: selectedModel, openrouter: budgetInfo };
if (!execute) { console.log(JSON.stringify(summary, null, 2)); process.exit(coverage.zendesk_error ? 2 : 0); }
if (rows.length === 0) { console.log(JSON.stringify(summary)); process.exit(0); }
if (coverage.zendesk_error || coverage.neither || !staged[0]?.ready || budgetInfo.status !== 'ok'
  || !Number.isFinite(budgetInfo.remaining) || budgetInfo.remaining <= 0)
  throw new Error('Execução bloqueada: fonte, staging ou orçamento OpenRouter indisponível.');
const schema = form => {
  const list = questions(form);
  return { type: 'object', properties: { answers: { type: 'object', properties: Object.fromEntries(list.map(q =>
    [q.id, { type: 'object', properties: { answer: { type: 'string', enum: ['SIM','NAO','NA'] },
      justification: { type: 'string' } }, required: ['answer','justification'], additionalProperties: false }])),
    required: list.map(q => q.id), additionalProperties: false },
    summary: { type: 'string' }, auditor_record: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    review_reasons: { type: 'array', items: { type: 'string' } } },
  required: ['answers','summary','auditor_record','strengths','improvements','review_reasons'], additionalProperties: false };
};
async function evaluate(prompt, form) {
  const model = selectedModel;
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json',
      'HTTP-Referer': 'https://qualitrack.app', 'X-OpenRouter-Title': 'WP Qualidade' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: `${prompt}\n\nRetorne somente JSON conforme schema: ${JSON.stringify(schema(form))}` }],
      max_tokens: 12000, provider: { allow_fallbacks: false } }), signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}; lote interrompido.`);
  const body = await response.json();
  if (body.model !== model) throw new Error('Modelo diferente do solicitado.');
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Resposta IA sem texto.');
  try {
    return { model, parsed: JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) };
  } catch { throw new Error('OpenRouter retornou JSON inválido; lote interrompido.'); }
}
for (const [index, row] of rows.entries()) {
  const type = kind(row), form = formById.get(FORMS[type]);
  const selectedManuals = manualsFor(type);
  const guidelineHash = sha(JSON.stringify(selectedManuals));
  const stored = Array.isArray(row.stored_dialogue) && row.stored_dialogue.length ? row.stored_dialogue : null;
  const dialogue = stored || zendeskByTicket.get(row.id);
  if (!dialogue?.length) throw new Error('Diálogo indisponível; lote interrompido.');
  const dialogueText = dialogue.map(m => `[${m.created_at || ''}] ${m.author_role || 'participante'}: ${m.body || m.plain_body || ''}`).join('\n');
  if (!dialogueText || dialogueText.length > 250_000) throw new Error('Diálogo vazio ou excessivo.');
  const child = type === 'ticket_filho' ? await childEvidence(String(row.ticket_id)) : null;
  const formHash = sha(JSON.stringify({ sections: form.sections, critical_errors: form.critical_errors }));
  const dialogueHash = sha(dialogueText);
  const inputHash = sha(JSON.stringify({ production_id: row.id, updated_at: row.updated_at, score: row.score,
    status: row.status, form_id: row.form_id, form_hash: formHash, guideline_hash: guidelineHash, dialogue_hash: dialogueHash }));
  const existing = await sql(DEVELOP, `SELECT id FROM public.production_pending_reevaluation_candidates
    WHERE production_project=${quote(PRODUCTION)} AND production_monitoria_id=${quote(row.id)}::uuid
    AND input_sha256=${quote(inputHash)}`);
  if (existing.length) { console.log(JSON.stringify({ cursor: row.id, state: 'replayed' })); continue; }
  if ((await budget()).remaining <= 0) throw new Error('Orçamento OpenRouter esgotado; lote interrompido.');
  const criteria = form.sections.map(s => `${s.title} (${s.weight}): ${s.questions.map(q => `[${q.id}] ${q.text}`).join('; ')}`).join('\n');
  const prompt = `Avalie conforme os manuais e a ficha vigente do develop. Responda SIM, NAO ou NA para cada questão.
Não copie falas nem inclua nomes, contatos ou dados pessoais nas justificativas/notas. NA quando faltar evidência.
Não aplique erro crítico: a ficha vigente não possui nenhum. Justifique cada resposta em paráfrase.
MANUAIS:\n${selectedManuals.map(g => `${g.title}\n${g.content}`).join('\n\n').slice(0, 40000)}
FICHA:\n${criteria}
${child ? `TICKET FILHO: avalie somente seis itens; vínculo, autoatribuição e equipe criadora exigem evidência. Assunto: ${child.subject}; pai: ${child.problem_id}; evidência de abertura: ${JSON.stringify(child)}.` : ''}
DIÁLOGO:\n${dialogueText}`;
  console.log(JSON.stringify({ cursor: row.id, state: 'evaluating' }));
  const ai = await evaluate(prompt, form);
  const result = validateAnswer(ai.parsed, form, dialogue, child);
  const [currentForm] = await sql(DEVELOP, `SELECT sections,critical_errors,active FROM public.forms
    WHERE id=${quote(form.id)}::uuid`);
  const currentGuidelines = await sql(DEVELOP, `SELECT id,title,content,updated_at
    FROM public.ai_evaluation_guidelines WHERE active ORDER BY created_at DESC`);
  if (!currentForm?.active || sha(JSON.stringify({ sections: currentForm.sections,
    critical_errors: currentForm.critical_errors })) !== formHash
    || sha(JSON.stringify(manualsFor(type, currentGuidelines))) !== guidelineHash)
    throw new Error('Ficha ou manuais develop mudaram; resultado descartado.');
  if (!stored) {
    const currentZendesk = await zendeskComments(String(row.ticket_id));
    const currentText = currentZendesk.map(m => `[${m.created_at || ''}] ${m.author_role || 'participante'}: ${m.body || m.plain_body || ''}`).join('\n');
    if (sha(currentText) !== dialogueHash) throw new Error('Diálogo Zendesk mudou; resultado descartado.');
  }
  const fresh = await sql(PRODUCTION, `SELECT m.id FROM public.monitorias m WHERE m.id=${quote(row.id)}::uuid
    AND active AND status='pendente_revisao' AND updated_at=${quote(row.updated_at)}::timestamptz
    AND score IS NOT DISTINCT FROM ${row.score == null ? 'NULL' : Number(row.score)}
    AND form_id=${quote(row.form_id)}::uuid
    AND coalesce(form_snapshot->'ai_evaluation'->'dialogue','null'::jsonb)
      = ${quote(JSON.stringify(row.stored_dialogue))}::jsonb
    AND EXISTS (SELECT 1 FROM public.helpdesk_submissions h WHERE h.monitoria_id=m.id
      AND h.status='sent') = ${row.already_sent ? 'true' : 'false'}`);
  if (fresh.length !== 1) throw new Error('Origem production mudou; resultado descartado.');
  const payload = { production_project: PRODUCTION, production_monitoria_id: row.id,
    ticket_id: String(row.ticket_id), ticket_kind: type, input_sha256: inputHash,
    dialogue_sha256: dialogueHash, dialogue_source: stored ? 'production_snapshot' : 'zendesk_comments',
    source_comment_count: dialogue.length, source_status: row.status, source_updated_at: row.updated_at,
    source_score: row.score, source_form_id: row.form_id, develop_form_id: form.id,
    develop_form_sha256: formHash, guideline_sha256: guidelineHash, already_sent: row.already_sent,
    model: ai.model, ...result };
  const columns = Object.keys(payload);
  const values = columns.map(key => `${payload[key] == null ? 'NULL' : quote(typeof payload[key] === 'object' ? JSON.stringify(payload[key]) : payload[key])}${
    ['suggested_answers','suggested_observations','strengths','improvements','review_reasons'].includes(key) ? '::jsonb' : ''}`);
  const inserted = await sql(DEVELOP, `INSERT INTO public.production_pending_reevaluation_candidates
    (${columns.join(',')}) VALUES (${values.join(',')})
    ON CONFLICT (production_project,production_monitoria_id,input_sha256) DO NOTHING RETURNING id`, true);
  if (inserted.length !== 1) throw new Error('Conflito de staging; lote interrompido.');
  console.log(JSON.stringify({ cursor: row.id, state: 'candidate_saved', candidate_id: inserted[0].id,
    proposed_score: result.suggested_score }));
  if (index < rows.length - 1) await wait(32_000);
}
console.log(JSON.stringify({ ...summary, state: 'completed' }));
