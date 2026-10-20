#!/usr/bin/env node
// Restricted maintenance runner: three known develop monitorias, no production writes.
// Source conversations and credentials live only in process memory.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PROJECT = 'secfejmccojxsvdntljx';
const TARGETS = new Map([
  ['180753', 'c315a981-c56f-4efd-8081-90981015edb5'],
  ['185553', 'fb1beb2d-13b7-482c-a827-b7ff2c3f7385'],
  ['185623', 'd7dd7163-ebdd-45a8-b6c7-82e3df4608c0'],
]);
const secretFile = 'C:/Users/User/Documents/Documents/Chave api openrouter.txt';
const zendeskFile = 'C:/Users/User/Documents/Documents/Projetos/zendesk-monitor/.env';
const secretText = readFileSync(secretFile, 'utf8');
const openrouterKey = secretText.match(/sk-or-v1-[A-Za-z0-9_-]+/)?.[0];
const developToken = [...secretText.matchAll(/sbp_[A-Za-z0-9_-]+/g)][0]?.[0];
if (!openrouterKey || !developToken) throw new Error('Credenciais locais incompletas.');
const zendeskEnv = Object.fromEntries(readFileSync(zendeskFile, 'utf8').split(/\r?\n/)
  .map(line => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(match => [match[1], match[2].replace(/^['"]|['"]$/g, '')]));
const sha = value => createHash('sha256').update(value).digest('hex');
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (process.argv.includes('--key-check')) {
  const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
    headers: { Authorization: `Bearer ${openrouterKey}` }, signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({}));
  console.log(JSON.stringify({ status: response.status, error_code: body.error?.code || null,
    error_message: String(body.error?.message || '').replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[key]').slice(0, 200) }));
  process.exit(response.ok ? 0 : 1);
}

async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${developToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Consulta develop HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`);
  return await response.json();
}

if (process.argv.includes('--migrate')) {
  const ddl = readFileSync(new URL('../supabase/migrations/20261019000003_active_monitoria_ai_candidates.sql', import.meta.url), 'utf8');
  if ((await sql("SELECT to_regclass('public.active_monitoria_ai_candidates') IS NOT NULL AS exists"))[0].exists)
    throw new Error('Tabela de candidatos já existe; migração não reaplicada.');
  await sql(ddl);
  console.log(JSON.stringify({ project: PROJECT, candidate_table_created: true }));
  process.exit(0);
}
if (!process.argv.includes('--execute') && !process.argv.includes('--preflight'))
  throw new Error('Use --migrate, --preflight ou --execute.');

const rows = await sql(`SELECT m.id,m.ticket_id,m.active,m.status,m.updated_at,m.form_id,m.score,
  m.answers,m.question_observations,m.selected_critical_errors,m.evaluator_note,m.form_snapshot,
  m.history,m.team_name,m.channel,m.pj_review_required,m.pj_review_kind,
  f.title,f.sections,f.critical_errors,f.active AS form_active,
  md5(f.sections::text || coalesce(f.critical_errors,'[]'::jsonb)::text) AS form_hash,
  md5(coalesce((m.form_snapshot->'ai_evaluation'->'dialogue')::text,'')) AS stored_dialogue_hash,
  EXISTS (SELECT 1 FROM public.helpdesk_submissions h WHERE h.monitoria_id=m.id AND h.status='sent') AS already_sent
  FROM public.monitorias m JOIN public.forms f ON f.id=m.form_id
  WHERE m.id IN (${[...TARGETS.values()].map(quote).join(',')}) ORDER BY m.ticket_id`);
if (rows.length !== 3 || rows.some(row => TARGETS.get(row.ticket_id) !== row.id || !row.active
  || row.status !== 'aguardando_gestor_qualidade' || !row.form_active || row.already_sent)) {
  throw new Error('Escopo ou estado das três monitorias mudou; lote interrompido.');
}
const guidelines = await sql(`SELECT id,title,content,updated_at FROM public.ai_evaluation_guidelines
  WHERE active ORDER BY created_at DESC`);
if (guidelines.length !== 3 || !guidelines.some(g => /filho/i.test(g.title)))
  throw new Error('Conjunto de manuais vigentes inesperado.');
const guidelineGuard = (await sql(`SELECT md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at)
  ORDER BY created_at DESC),'[]'::jsonb)::text) AS hash FROM public.ai_evaluation_guidelines WHERE active`))[0].hash;
const report = { project: PROJECT, generated_at: new Date().toISOString(), items: [] };

function score(sections, answers) {
  let earned = 0, possible = 0;
  for (const section of sections) {
    if (section.questions.some(q => q.is_critical && answers[q.id] === 'NAO')) return 0;
    const active = section.questions.filter(q => answers[q.id] !== 'NA');
    for (const q of active) { const weight = section.weight / active.length; possible += weight; if (answers[q.id] === 'SIM') earned += weight; }
  }
  return possible ? Math.round(earned / possible * 10_000) / 100 : 100;
}
function schemaFor(sections) {
  const entries = sections.flatMap(s => s.questions);
  return { type: 'object', properties: {
    answers: { type: 'object', properties: Object.fromEntries(entries.map(q => [q.id, { type: 'object', properties: {
      answer: { type: 'string', enum: ['SIM','NAO','NA'] },
      justification: { type: 'string', description: 'Evidência resumida por paráfrase, sem nome, contato ou citação literal.' },
    }, required: ['answer','justification'], additionalProperties: false }])), required: entries.map(q => q.id), additionalProperties: false },
    strengths: { type: 'array', items: { type: 'string' } }, improvements: { type: 'array', items: { type: 'string' } },
    requires_human_review: { type: 'boolean' }, review_reasons: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' }, score: { type: 'number' }, auditor_record: { type: 'string' },
  }, required: ['answers','strengths','improvements','requires_human_review','review_reasons','summary','score','auditor_record'], additionalProperties: false };
}
function scrub(value) {
  return String(value || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/https?:\/\/\S+/gi, '[url]').replace(/\b(?:\+?\d[\d ().-]{8,}\d)\b/g, '[contato]')
    .replace(/["“][^"”]{15,}["”]/g, '[trecho omitido]').slice(0, 3000);
}
function safeText(value, dialogue) {
  let text = scrub(value);
  for (const message of dialogue) {
    const body = String(message.body || message.plain_body || '');
    if (body.length >= 40 && text.includes(body)) text = text.replaceAll(body, '[trecho omitido]');
  }
  return text;
}
function parseAI(content) {
  const raw = typeof content === 'string' ? content : Array.isArray(content) ? content.map(x => x.text || '').join('') : '';
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(trimmed);
}
async function evaluate(prompt, schema) {
  for (const model of ['z-ai/glm-5.3-flash', 'google/gemma-4-31b-it']) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json',
          'HTTP-Referer': 'https://qualitrack.app', 'X-OpenRouter-Title': 'WP Qualidade' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: `${prompt}\n\nResponda SOMENTE com objeto JSON válido que siga exatamente este JSON Schema:\n${JSON.stringify(schema)}` }],
          max_tokens: 12000, provider: { allow_fallbacks: true, sort: 'throughput' } }),
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (body.model !== model) throw new Error('OpenRouter retornou modelo diferente do solicitado.');
        try { return { value: parseAI(body.choices?.[0]?.message?.content), model, usage: body.usage }; }
        catch { if (attempt === 2) break; }
      } else if (response.status < 500 && response.status !== 429) {
        throw new Error(`OpenRouter HTTP ${response.status}; execução interrompida.`);
      }
      if (attempt < 2) await sleep(5_000);
    }
  }
  throw new Error('OpenRouter não entregou JSON válido após tentativas limitadas.');
}
async function zendesk(path) {
  const { ZENDESK_SUBDOMAIN: sub, ZENDESK_EMAIL: email, ZENDESK_API_TOKEN: token } = zendeskEnv;
  if (!/^[a-z0-9-]+$/i.test(sub || '') || !email || !token) throw new Error('Credenciais Zendesk incompletas.');
  const origin = `https://${sub}.zendesk.com`;
  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/api/v2/')) throw new Error('GET Zendesk fora do escopo.');
  const response = await fetch(url, { method: 'GET', headers: { Authorization: `Basic ${Buffer.from(`${email}/token:${token}`).toString('base64')}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Zendesk GET HTTP ${response.status}.`);
  return await response.json();
}
async function childSource(ticketId) {
  const [ticketBody, commentsBody, auditsBody] = await Promise.all([
    zendesk(`/api/v2/tickets/${ticketId}.json`), zendesk(`/api/v2/tickets/${ticketId}/comments.json?include=users&per_page=100`),
    zendesk(`/api/v2/tickets/${ticketId}/audits.json?per_page=100`),
  ]);
  if (commentsBody.next_page || auditsBody.next_page) throw new Error('Paginação Zendesk não tratada; execução interrompida.');
  const ticket = ticketBody.ticket;
  if (String(ticket?.id) !== ticketId) throw new Error('Zendesk retornou outro ticket.');
  const opening = auditsBody.audits?.find(a => a.events?.some(e => e.type === 'Create'));
  const createEvents = opening?.events?.filter(e => e.type === 'Create') || [];
  const field = name => createEvents.find(e => e.field_name === name)?.value;
  const creator = opening?.author_id, initialAssignee = field('assignee_id'), initialGroup = field('group_id');
  const group = initialGroup ? (await zendesk(`/api/v2/groups/${initialGroup}.json`)).group : null;
  const evidence = { creator_id: creator ?? null, initial_assignee_id: initialAssignee ?? null,
    initial_group_name: group?.name || null, self_assigned: creator != null && initialAssignee != null ? String(creator) === String(initialAssignee) : null };
  const dialogue = commentsBody.comments || [];
  const userRoles = Object.fromEntries((commentsBody.users || []).map(u => [u.id, u.role]));
  const text = dialogue.map(c => `[${c.created_at || ''}] ${userRoles[c.author_id] || 'participante'}: ${c.body || c.plain_body || ''}`).join('\n');
  if (!text || text.length > 250_000) throw new Error('Diálogo do filho ausente ou excessivo.');
  return { ticket, dialogue, text, evidence };
}

function validateResult(parsed, row, dialogue, child) {
  if (!parsed || typeof parsed !== 'object' || !parsed.answers || typeof parsed.answers !== 'object') throw new Error('IA não retornou respostas.');
  const questions = row.sections.flatMap(s => s.questions);
  const ids = new Set(questions.map(q => q.id));
  if (ids.size !== questions.length || Object.keys(parsed.answers).length !== ids.size) throw new Error('Conjunto de perguntas divergente.');
  const answers = {}, observations = {};
  for (const q of questions) {
    const answer = parsed.answers[q.id];
    if (!['SIM','NAO','NA'].includes(answer?.answer) || !String(answer?.justification || '').trim())
      throw new Error(`Resposta inválida para ${q.id}.`);
    answers[q.id] = answer.answer;
    observations[q.id] = safeText(answer.justification, dialogue);
  }
  if (child && child.evidence.self_assigned !== null) {
    const id = 'child-routing-correct';
    answers[id] = child.evidence.self_assigned ? 'SIM' : 'NAO';
    observations[id] = child.evidence.self_assigned
      ? 'Histórico de abertura confirma autoatribuição pelo mesmo Zendesk ID.'
      : 'Histórico de abertura confirma destinatário inicial diferente do criador.';
  }
  if (child && child.evidence.self_assigned && child.evidence.initial_group_name) {
    const id = 'child-creator-authorized';
    const forbidden = /an[aá]lise t[eé]cnica|an[aá]lise de corre[cç][oõ]es/i.test(child.evidence.initial_group_name);
    answers[id] = forbidden ? 'NAO' : 'SIM';
    observations[id] = forbidden ? 'Grupo do criador no histórico de abertura pertence a equipe vedada pelo manual.'
      : 'Grupo do criador no histórico de abertura não pertence a equipe vedada pelo manual.';
  }
  const canonical = score(row.sections, answers);
  const reasons = Array.isArray(parsed.review_reasons) ? parsed.review_reasons.map(x => safeText(x, dialogue)) : [];
  if (child && (!child.evidence.initial_group_name || child.evidence.self_assigned === null)) reasons.push('Equipe ou destinatário inicial não comprovado no histórico de abertura.');
  return { score: canonical, model_reported_score: Number(parsed.score),
    summary: safeText(parsed.summary, dialogue), auditor_record: safeText(parsed.auditor_record, dialogue),
    strengths: (parsed.strengths || []).map(x => safeText(x, dialogue)),
    improvements: (parsed.improvements || []).map(x => safeText(x, dialogue)),
    suggested_answers: answers, suggested_observations: observations, suggested_critical_errors: {},
    requires_human_review: Boolean(parsed.requires_human_review || reasons.length || child), review_reasons: reasons,
  };
}

function promptFor(row, dialogueText, child) {
  const criteria = row.sections.map(s => `Seção ${s.title} (peso ${s.weight}):\n${s.questions.map(q => `- [${q.id}] ${q.text}`).join('\n')}`).join('\n\n');
  const manuals = child ? guidelines.filter(g => /filho/i.test(g.title)) : guidelines;
  const manualText = manuals.map(g => `### ${g.title}\n${g.content}`).join('\n\n').slice(0, child ? 20000 : 40000);
  const childRules = child ? `\nREGRAS DO FILHO: avalie somente os seis itens da ficha. Assunto pode receber prefixo Ticket, sufixo do pai e macro de resolvido. Texto integral da macro deve ser preservado; detalhe complementar breve e específico pode bastar, sem exigir campos opcionais. O filho começa atribuído ao agente que o criou; compare IDs do histórico, não confunda grupo atual nem destino do pai. Equipe de Análise Técnica ou de Correções não pode criar o filho. Sem prova de vínculo com o pai ou da equipe criadora, marque NA e revisão humana. Não avalie tags.\nDADOS DO TICKET: assunto ${child.ticket.subject || ''}; status ${child.ticket.status || ''}; problem_id ${child.ticket.problem_id || 'não informado'}.\nHISTÓRICO DE ABERTURA: ${JSON.stringify(child.evidence)}.\n` : '';
  return `Você é auditor sênior da WebPosto. Avalie o atendimento com a ficha e o manual vigentes. O manual prevalece em conflito.\nMANUAL:\n${manualText}\nCRITÉRIOS EXATOS DA FICHA:\n${criteria}\n${childRules}\nTRANSCRIÇÃO COMPLETA:\n${dialogueText}\nLIMITES DE EVIDÊNCIA: não invente vínculos, aprovações ou fatos externos ausentes. Responda SIM, NAO ou NA para cada item; NA para evidência insuficiente. Dê justificativa por item em paráfrase, sem copiar diálogos nem incluir nomes, telefones ou emails. Ao final liste pontos fortes, melhorias, necessidade de revisão humana, resumo, nota e Registro do Auditor em um parágrafo. Nota calculada das respostas; nenhum erro crítico está ativo na ficha vigente. Não mencione IA no registro.`;
}

if (process.argv.includes('--preflight')) {
  const child = await childSource('180753');
  console.log(JSON.stringify({ project: PROJECT, candidates_table: true,
    guidelines: guidelines.map(g => ({ id: g.id, length: g.content.length })),
    items: rows.map(row => ({ ticket_id: row.ticket_id, score: Number(row.score),
      question_count: row.sections.reduce((n, s) => n + s.questions.length, 0),
      critical_count: row.critical_errors.length,
      dialogue_count: row.ticket_id === '180753' ? child.dialogue.length : row.form_snapshot?.ai_evaluation?.dialogue?.length,
      source: row.ticket_id === '180753' ? 'zendesk_get' : 'form_snapshot.ai_evaluation.dialogue' })) }));
  process.exit(0);
}

for (const row of rows) {
  const child = row.ticket_id === '180753' ? await childSource(row.ticket_id) : null;
  const dialogue = child?.dialogue || row.form_snapshot?.ai_evaluation?.dialogue;
  if (!Array.isArray(dialogue) || !dialogue.length) throw new Error(`Diálogo indisponível para ${row.ticket_id}.`);
  const dialogueText = child?.text || dialogue.map(m => `[${m.created_at || ''}] ${m.author_role || 'participante'}: ${m.body || ''}`).join('\n');
  if (dialogueText.length > 250_000) throw new Error('Diálogo excede limite.');
  const inputHash = sha(JSON.stringify({ monitoria: row.id, updated_at: row.updated_at, form_hash: row.form_hash,
    guideline_guard: guidelineGuard, dialogue_hash: child ? sha(dialogueText) : row.stored_dialogue_hash }));
  const requestId = `${inputHash.slice(0,8)}-${inputHash.slice(8,12)}-4${inputHash.slice(13,16)}-a${inputHash.slice(17,20)}-${inputHash.slice(20,32)}`;
  const existing = await sql(`SELECT id,state,result->>'score' AS score FROM public.active_monitoria_ai_candidates
    WHERE monitoria_id=${quote(row.id)} AND request_id=${quote(requestId)}`);
  if (existing.length) {
    report.items.push({ ticket_id: row.ticket_id, previous_score: Number(row.score), candidate_score: Number(existing[0].score),
      candidate_id: existing[0].id, state: existing[0].state, replayed: true });
    continue;
  }
  console.log(JSON.stringify({ ticket_id: row.ticket_id, phase: 'evaluating' }));
  const evaluated = await evaluate(promptFor(row, dialogueText, child), schemaFor(row.sections));
  const result = validateResult(evaluated.value, row, dialogue, child);
  const officialSnapshot = { score: row.score, answers: row.answers, question_observations: row.question_observations,
    selected_critical_errors: row.selected_critical_errors, evaluator_note: row.evaluator_note, status: row.status,
    updated_at: row.updated_at, form_id: row.form_id };
  const formSnapshot = { id: row.form_id, title: row.title, sections: row.sections, critical_errors: row.critical_errors, active: row.form_active };
  const guidelineSnapshot = guidelines.map(g => ({ id: g.id, title: g.title, updated_at: g.updated_at, content_sha256: sha(g.content) }));
  const comparison = { previous_score: Number(row.score), proposed_score: result.score, score_delta: result.score - Number(row.score),
    model_reported_score: result.model_reported_score, source_comment_count: dialogue.length,
    dialogue_sha256: sha(dialogueText), source_form_md5: row.form_hash, source_guideline_md5: guidelineGuard,
    requires_human_review: result.requires_human_review, review_reasons: result.review_reasons,
    source: child ? 'zendesk_get' : 'form_snapshot.ai_evaluation.dialogue',
    ticket_kind: child ? 'chamado_filho' : 'atendimento' };
  delete result.model_reported_score;
  const payload = { monitoria_id: row.id, request_id: requestId, state: 'completed', source_updated_at: row.updated_at,
    source_status: row.status, form_id: row.form_id, form_snapshot: formSnapshot, guideline_snapshot: guidelineSnapshot,
    official_snapshot: officialSnapshot, result, comparison, model: evaluated.model, generated_by: 'local_openrouter',
    created_by: null, finished_at: new Date().toISOString() };
  const insert = await sql(`WITH source AS (
    SELECT m.id FROM public.monitorias m JOIN public.forms f ON f.id=m.form_id
    WHERE m.id=${quote(row.id)} AND m.active AND m.status=${quote(row.status)}
      AND m.updated_at=${quote(row.updated_at)}::timestamptz AND m.form_id=${quote(row.form_id)}
      AND md5(f.sections::text || coalesce(f.critical_errors,'[]'::jsonb)::text)=${quote(row.form_hash)}
      AND md5(coalesce((m.form_snapshot->'ai_evaluation'->'dialogue')::text,''))=${quote(row.stored_dialogue_hash)}
      AND (SELECT md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at)
        ORDER BY created_at DESC),'[]'::jsonb)::text) FROM public.ai_evaluation_guidelines WHERE active)=${quote(guidelineGuard)}
      AND NOT EXISTS (SELECT 1 FROM public.helpdesk_submissions h WHERE h.monitoria_id=m.id AND h.status='sent')
  ) INSERT INTO public.active_monitoria_ai_candidates (
    monitoria_id,request_id,state,source_updated_at,source_status,form_id,form_snapshot,guideline_snapshot,
    official_snapshot,result,comparison,model,generated_by,created_by,finished_at
  ) SELECT ${quote(payload.monitoria_id)}::uuid,${quote(payload.request_id)}::uuid,${quote(payload.state)},
    ${quote(payload.source_updated_at)}::timestamptz,${quote(payload.source_status)},${quote(payload.form_id)}::uuid,
    ${quote(JSON.stringify(payload.form_snapshot))}::jsonb,${quote(JSON.stringify(payload.guideline_snapshot))}::jsonb,
    ${quote(JSON.stringify(payload.official_snapshot))}::jsonb,${quote(JSON.stringify(payload.result))}::jsonb,
    ${quote(JSON.stringify(payload.comparison))}::jsonb,${quote(payload.model)},${quote(payload.generated_by)},NULL,
    ${quote(payload.finished_at)}::timestamptz FROM source
    ON CONFLICT (monitoria_id,request_id) DO NOTHING RETURNING id`);
  if (insert.length !== 1) throw new Error(`Estado mudou ou candidato concorrente para ${row.ticket_id}; resultado não gravado.`);
  report.items.push({ ticket_id: row.ticket_id, previous_score: Number(row.score), candidate_score: result.score,
    candidate_id: insert[0].id, state: 'completed', human_review: result.requires_human_review,
    eligible_for_validation: result.score >= 75, publication: child ? 'macro própria de chamado filho' : 'fluxo oficial de avaliação',
    answers: result.suggested_answers });
  console.log(JSON.stringify({ ticket_id: row.ticket_id, phase: 'candidate_saved', score: result.score, candidate_id: insert[0].id }));
  if (row !== rows.at(-1)) await sleep(32_000);
}
console.log(JSON.stringify(report, null, 2));
