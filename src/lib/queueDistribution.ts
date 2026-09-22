import { supabase, isMockMode } from './supabase';
import { AuditingQueueType } from '../types';

/** Filas com distribuição 1-para-1 entre monitores de qualidade online. */
export type DistributedQueueType = Extract<AuditingQueueType, 'negativas' | 'filhos'>;

export function isDistributedQueue(queueType: AuditingQueueType): queueType is DistributedQueueType {
  return queueType === 'negativas' || queueType === 'filhos';
}

export interface MonitorPresence {
  user_id: string;
  is_enabled: boolean;
}

/** Carrega quais monitores estão habilitados para receber a fila. */
export async function fetchMonitorEligibility(): Promise<Record<string, boolean>> {
  if (isMockMode || !supabase) return {};
  const { data, error } = await supabase.from('quality_monitor_presence').select('user_id, is_enabled');
  if (error) {
    console.warn('[queueDistribution] Falha ao carregar elegibilidade dos monitores:', error);
    return {};
  }
  const map: Record<string, boolean> = {};
  (data || []).forEach((row: MonitorPresence) => { map[row.user_id] = row.is_enabled; });
  return map;
}

/** Habilita/desabilita um monitor na triagem. Presença online é automática. */
export async function setMonitorEligibility(userId: string, enabled: boolean): Promise<void> {
  if (isMockMode || !supabase) throw new Error('Indisponível em modo mock/offline.');
  const { error } = await supabase.rpc('set_monitor_eligibility', { p_user_id: userId, p_enabled: enabled });
  if (error) throw new Error(error.message || 'Falha ao atualizar elegibilidade do monitor.');
}

/** Busca as atribuições já existentes para um conjunto de tickets de uma fila distribuída. */
export async function fetchQueueAssignments(
  queueType: DistributedQueueType,
  ticketIds: string[]
): Promise<Record<string, string>> {
  if (isMockMode || !supabase || ticketIds.length === 0) return {};
  const { data, error } = await supabase
    .from('queue_ticket_assignments')
    .select('ticket_id, assigned_to')
    .eq('queue_type', queueType)
    .in('ticket_id', ticketIds);
  if (error) {
    console.warn('[queueDistribution] Falha ao carregar atribuições da fila:', error);
    throw new Error(error.message || 'Falha ao carregar atribuições da fila.');
  }
  const map: Record<string, string> = {};
  (data || []).forEach((row: { ticket_id: string; assigned_to: string }) => { map[row.ticket_id] = row.assigned_to; });
  return map;
}

/**
 * Distribui os tickets ainda sem dono entre os monitores online (1 para 1,
 * balanceado pela contagem acumulada do dia). Retorna só as novas
 * atribuições feitas nesta chamada — tickets já atribuídos são ignorados
 * pela função no banco, e tickets sem monitor online ficam sem dono até a
 * próxima sincronização.
 */
export async function syncQueueAssignments(
  queueType: DistributedQueueType,
  ticketIds: string[]
): Promise<Record<string, string>> {
  if (isMockMode || !supabase || ticketIds.length === 0) return {};
  const payload = ticketIds.map(ticket_id => ({ ticket_id, queue_type: queueType }));
  const { data, error } = await supabase.rpc('assign_queue_tickets', { p_tickets: payload });
  if (error) {
    console.warn('[queueDistribution] Falha ao distribuir chamados da fila:', error);
    throw new Error(error.message || 'Falha ao distribuir chamados da fila.');
  }
  const map: Record<string, string> = {};
  (data || []).forEach((row: { ticket_id: string; assigned_to: string }) => { map[row.ticket_id] = row.assigned_to; });
  return map;
}
