#!/usr/bin/env node
// Explicit administrator selection in develop. Never publishes to Zendesk.
import { readFileSync } from 'node:fs';

const project = 'secfejmccojxsvdntljx';
const candidateId = process.argv[2];
const noteFile = process.argv[3];
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId || '') || !noteFile)
  throw new Error('Uso: node scripts/select-active-reevaluation.mjs <candidate-uuid> <arquivo-da-justificativa>');
const note = readFileSync(noteFile, 'utf8').trim();
if (note.length < 15 || note.length > 2000) throw new Error('Justificativa deve ter de 15 a 2000 caracteres.');
const jwt = process.env.SUPABASE_ADMIN_JWT;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!jwt || !anonKey) throw new Error('Defina SUPABASE_ADMIN_JWT e SUPABASE_ANON_KEY.');
const endpoint = `https://${project}.supabase.co/functions/v1/helpdesk-queue`;
async function invoke(body) {
  const response = await fetch(endpoint, { method: 'POST', headers: {
    Authorization: `Bearer ${jwt}`, apikey: anonKey, 'Content-Type': 'application/json',
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const capability = await invoke({ action: 'active_reevaluation_capabilities' });
if (capability.status !== 200 || capability.body.version !== 'active-monitoria-reevaluation-v1'
  || capability.body.publish_to_zendesk !== false)
  throw new Error('Versão segura da Edge Function indisponível no develop.');
const selected = await invoke({ action: 'select_active_reevaluation', candidate_id: candidateId, selection_note: note });
if (selected.status !== 200 || !selected.body.success)
  throw new Error(`Seleção recusada (${selected.status}): ${selected.body.error || 'erro desconhecido'}`);
console.log(JSON.stringify(selected.body, null, 2));
