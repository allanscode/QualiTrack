#!/usr/bin/env node
// Develop-only batch driver. Default is read-only; --execute generates isolated candidates.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PROJECT = 'secfejmccojxsvdntljx';
const args = new Set(process.argv.slice(2));
const execute = args.has('--execute');
const token = process.env.SUPABASE_ACCESS_TOKEN || (process.env.SUPABASE_TOKEN_FILE
  ? readFileSync(process.env.SUPABASE_TOKEN_FILE, 'utf8').match(/sbp_[A-Za-z0-9_-]+/)?.[0] : undefined);
if (!token) throw new Error('Defina SUPABASE_ACCESS_TOKEN ou SUPABASE_TOKEN_FILE.');
const sql = `SELECT m.id, m.ticket_id, m.status, m.score, m.updated_at, count(*) over() AS total_count,
  CASE WHEN m.form_id='6c7d1e88-841b-4da9-9a66-9f1464ce896f'::uuid
         OR m.form_snapshot->>'ticket_kind'='chamado_filho' THEN 'chamado_filho_fluxo_proprio'
       WHEN f.id IS NULL THEN 'ficha_inativa'
       WHEN m.ticket_id !~ '^[0-9]+$' THEN 'ticket_invalido'
       WHEN EXISTS (SELECT 1 FROM public.helpdesk_submissions h WHERE h.monitoria_id=m.id AND h.status='sent') THEN 'ja_publicada'
       ELSE 'pronta_para_previa' END AS readiness
FROM public.monitorias m LEFT JOIN public.forms f ON f.id=m.form_id AND f.active
WHERE m.active AND m.status IN ('aguardando_gestor_suporte','aguardando_gestor_qualidade')
ORDER BY m.created_at,m.id`;
const query = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
if (!query.ok) throw new Error(`Consulta develop falhou (${query.status}): ${(await query.text()).slice(0, 300)}`);
const rows = await query.json();
if (!Array.isArray(rows)) throw new Error('Formato inesperado da consulta develop.');
if (rows.length && Number(rows[0].total_count) !== rows.length)
  throw new Error('Consulta develop retornou apenas parte das monitorias; lote interrompido.');
const counts = rows.reduce((acc, row) => { acc[row.readiness] = (acc[row.readiness] || 0) + 1; return acc; }, {});
const report = { project: PROJECT, mode: execute ? 'candidate_generation' : 'dry_run',
  generated_at: new Date().toISOString(), total_active_awaiting_manager: rows.length, counts,
  items: rows.map(row => ({ monitoria_id: row.id, ticket_id: row.ticket_id, status: row.status,
    current_score: row.score, readiness: row.readiness, execution: 'not_started' })) };
function requestId(row) {
  const hex = createHash('sha256').update(`active-monitoria-v1:${row.id}:${row.updated_at}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
if (!execute) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const jwt = process.env.SUPABASE_ADMIN_JWT;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!jwt || !anonKey) throw new Error('Execução exige SUPABASE_ADMIN_JWT e SUPABASE_ANON_KEY.');
const endpoint = `https://${PROJECT}.supabase.co/functions/v1/helpdesk-queue`;
async function invoke(body) {
  const response = await fetch(endpoint, { method: 'POST', headers: {
    Authorization: `Bearer ${jwt}`, apikey: anonKey, 'Content-Type': 'application/json',
  }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
const capabilities = await invoke({ action: 'active_reevaluation_capabilities' });
if (capabilities.status !== 200 || capabilities.data.version !== 'active-monitoria-reevaluation-v1'
  || capabilities.data.publish_to_zendesk !== false) {
  throw new Error('A versão segura da Edge Function não está implantada no develop. Lote não iniciado.');
}
for (const item of report.items) {
  if (item.readiness !== 'pronta_para_previa') { item.execution = 'skipped'; continue; }
  try {
    const row = rows.find(row => row.id === item.monitoria_id);
    const response = await invoke({ action: 'reevaluate_active_monitoria', monitoria_id: item.monitoria_id,
      request_id: requestId(row) });
    const candidate = response.data.candidate || response.data;
    item.execution = response.status === 200 && candidate.state === 'completed'
      ? (response.data.replayed ? 'candidate_replayed' : 'candidate_created') : 'failed';
    item.candidate_id = candidate.id || response.data.candidate_id || null;
    item.proposed_score = candidate.result?.score ?? null;
    item.selectable = response.data.selectable === true || (response.data.replayed
      && Number(candidate.result?.score) >= 75);
    item.requires_human_review = candidate.result?.requires_human_review === true;
    item.error = item.execution === 'failed' ? String(response.data.error || `HTTP ${response.status}`).slice(0, 500) : null;
  } catch (error) {
    item.execution = 'failed';
    item.error = String(error instanceof Error ? error.message : error).slice(0, 500);
  }
  // Server policy allows 10 AI calls per rolling five minutes per administrator.
  if (report.items.some(next => next !== item && next.execution === 'not_started' && next.readiness === 'pronta_para_previa'))
    await new Promise(resolve => setTimeout(resolve, 32_000));
}
report.completed_at = new Date().toISOString();
const output = process.env.REEVALUATION_REPORT_PATH || `active-monitoria-reevaluation-${Date.now()}.json`;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ total: rows.length, counts, candidate_created: report.items.filter(i => i.execution === 'candidate_created').length,
  failed: report.items.filter(i => i.execution === 'failed').length, report_path: output }, null, 2));
