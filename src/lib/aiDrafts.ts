import { supabase, isMockMode } from './supabase';
import { AIEvaluationResult, AuditingQueueTicket, AuditingQueueType } from '../types';

const MOCK_DRAFTS_KEY = 'qualitrack-ai-drafts';

function readMockDrafts(): Record<string, AIEvaluationDraft> {
  try { return JSON.parse(localStorage.getItem(MOCK_DRAFTS_KEY) || '{}'); }
  catch { return {}; }
}

export interface AIEvaluationDraft {
  id: string;
  ticket_id: string;
  form_id?: string;
  agent_name?: string;
  agent_email?: string;
  agent_id?: string;
  team_id?: string;
  channel?: string;
  satisfaction_comment?: string;
  result: AIEvaluationResult;
  guideline_ids: string[];
  created_at: string;
  updated_at: string;
  source_queue?: AuditingQueueType;
  ticket_snapshot?: AuditingQueueTicket;
}

/**
 * Busca os rascunhos de avaliação da IA já prontos para os tickets
 * informados — evita repetir a chamada à IA (tempo + tokens) toda vez que
 * o monitor volta na mesma fila.
 */
export async function fetchAIDrafts(ticketIds: string[]): Promise<Record<string, AIEvaluationDraft>> {
  if (ticketIds.length === 0) return {};
  if (isMockMode || !supabase) {
    const saved = readMockDrafts();
    return Object.fromEntries(ticketIds.filter(id => saved[id]).map(id => [id, saved[id]]));
  }

  const { data, error } = await supabase
    .from('ai_evaluation_drafts')
    .select('*')
    .in('ticket_id', ticketIds);

  if (error) {
    console.warn('[AIDrafts] Falha ao carregar rascunhos:', error.message);
    return {};
  }

  const map: Record<string, AIEvaluationDraft> = {};
  (data || []).forEach((d: any) => { map[d.ticket_id] = d; });
  return map;
}

/** Loads drafts independently of the current Zendesk view; database RLS limits visibility. */
export async function fetchOpenAIDrafts(queue: AuditingQueueType): Promise<AIEvaluationDraft[]> {
  if (queue !== 'negativas' && queue !== 'proativas' && queue !== 'positivas') return [];
  if (isMockMode || !supabase) return Object.values(readMockDrafts()).filter(d => d.source_queue === queue || (queue === 'proativas' && !d.source_queue));

  const drafts: AIEvaluationDraft[] = [];
  for (let from = 0; ; from += 500) {
    let query = supabase.from('ai_evaluation_drafts').select('*');
    query = queue === 'proativas'
      ? query.or('source_queue.eq.proativas,source_queue.is.null')
      : query.eq('source_queue', queue);
    const { data, error } = await query.order('updated_at', { ascending: false }).range(from, from + 499);
    if (error) throw new Error(`Falha ao carregar rascunhos de IA: ${error.message}`);
    drafts.push(...(data || []) as AIEvaluationDraft[]);
    if (!data || data.length < 500) break;
  }
  return drafts;
}

/**
 * Salva (ou sobrescreve, se já existir um rascunho pra esse ticket) o
 * resultado de uma avaliação com IA — fica disponível pra "Lançar
 * Monitoria" depois, sem precisar rodar a IA de novo.
 */
export async function saveAIDraft(params: {
  ticketId: string;
  formId?: string;
  agentName?: string;
  agentEmail?: string;
  agentId?: string;
  teamId?: string;
  channel?: string;
  satisfactionComment?: string;
  result: AIEvaluationResult;
  guidelineIds: string[];
  createdBy?: string;
  sourceQueue?: AuditingQueueType;
  ticketSnapshot?: AuditingQueueTicket;
}): Promise<void> {
  if (isMockMode || !supabase) {
    const saved = readMockDrafts();
    const now = new Date().toISOString();
    saved[params.ticketId] = {
      id: saved[params.ticketId]?.id || params.ticketId,
      ticket_id: params.ticketId, form_id: params.formId, agent_name: params.agentName,
      agent_email: params.agentEmail, agent_id: params.agentId, team_id: params.teamId,
      channel: params.channel, satisfaction_comment: params.satisfactionComment,
      result: params.result, guideline_ids: params.guidelineIds,
      source_queue: params.sourceQueue, ticket_snapshot: params.ticketSnapshot,
      created_at: saved[params.ticketId]?.created_at || now, updated_at: now,
    };
    localStorage.setItem(MOCK_DRAFTS_KEY, JSON.stringify(saved));
    return;
  }

  const { error } = await supabase
    .from('ai_evaluation_drafts')
    .upsert({
      ticket_id: params.ticketId,
      form_id: params.formId,
      agent_name: params.agentName,
      agent_email: params.agentEmail,
      agent_id: params.agentId,
      team_id: params.teamId,
      channel: params.channel,
      satisfaction_comment: params.satisfactionComment,
      result: params.result,
      guideline_ids: params.guidelineIds,
      created_by: params.createdBy,
    }, { onConflict: 'ticket_id' });

  if (error) {
    console.error('[AIDrafts] Falha ao salvar rascunho:', error.message);
    if (error.message.includes('transferido para outro monitor')) {
      throw new Error('Este ticket foi transferido para outro monitor durante a avaliação. O resultado não foi salvo.');
    }
    throw new Error(`Não foi possível salvar o rascunho da IA: ${error.message}`);
  }
}

/**
 * Remove o rascunho depois que a monitoria foi de fato lançada — vira uma
 * monitoria real na tabela `monitorias`, não precisa mais do cache.
 */
export async function deleteAIDraft(ticketId: string): Promise<void> {
  if (isMockMode || !supabase) {
    const saved = readMockDrafts();
    delete saved[ticketId];
    localStorage.setItem(MOCK_DRAFTS_KEY, JSON.stringify(saved));
    return;
  }
  const { error } = await supabase.from('ai_evaluation_drafts').delete().eq('ticket_id', ticketId);
  if (error) console.warn('[AIDrafts] Falha ao remover rascunho:', error.message);
}
