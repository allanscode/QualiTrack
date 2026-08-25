import { supabase, isMockMode } from './supabase';
import { AIEvaluationResult } from '../types';

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
}

/**
 * Busca os rascunhos de avaliação da IA já prontos para os tickets
 * informados — evita repetir a chamada à IA (tempo + tokens) toda vez que
 * o monitor volta na mesma fila.
 */
export async function fetchAIDrafts(ticketIds: string[]): Promise<Record<string, AIEvaluationDraft>> {
  if (isMockMode || !supabase || ticketIds.length === 0) return {};

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
}): Promise<void> {
  if (isMockMode || !supabase) return;

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
    // Não interrompe o fluxo — o monitor já viu o resultado na tela, só
    // perde a persistência (vai ter que reavaliar se sair e voltar).
  }
}

/**
 * Remove o rascunho depois que a monitoria foi de fato lançada — vira uma
 * monitoria real na tabela `monitorias`, não precisa mais do cache.
 */
export async function deleteAIDraft(ticketId: string): Promise<void> {
  if (isMockMode || !supabase) return;
  const { error } = await supabase.from('ai_evaluation_drafts').delete().eq('ticket_id', ticketId);
  if (error) console.warn('[AIDrafts] Falha ao remover rascunho:', error.message);
}
