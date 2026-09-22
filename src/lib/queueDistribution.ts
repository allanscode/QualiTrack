import { supabase, isMockMode } from './supabase';
import { AuditingQueueType } from '../types';

/** Filas com distribuição 1-para-1 entre monitores de qualidade online. */
export type DistributedQueueType = Extract<AuditingQueueType, 'negativas' | 'filhos'>;

export function isDistributedQueue(queueType: AuditingQueueType): queueType is DistributedQueueType {
  return queueType === 'negativas' || queueType === 'filhos';
}

export function canManageQueueAssignments(role?: string): boolean {
  return role === 'admin' || role === 'gestor_qualidade';
}

export interface MonitorPresence {
  user_id: string;
  is_enabled: boolean;
}

export type QueueAssignmentStatus = 'pending' | 'in_progress' | 'completed';
export type QueueAssignmentSource = 'automatic' | 'manual';

export interface QueueAssignment {
  ticket_id: string;
  queue_type: DistributedQueueType;
  assigned_to: string;
  status: QueueAssignmentStatus;
  assignment_source: QueueAssignmentSource;
  started_at: string | null;
  started_by: string | null;
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
): Promise<Record<string, QueueAssignment>> {
  if (isMockMode || !supabase || ticketIds.length === 0) return {};
  const { data, error } = await supabase
    .from('queue_ticket_assignments')
    .select('ticket_id, queue_type, assigned_to, status, assignment_source, started_at, started_by')
    .eq('queue_type', queueType)
    .in('ticket_id', ticketIds);
  if (error) {
    console.warn('[queueDistribution] Falha ao carregar atribuições da fila:', error);
    throw new Error(error.message || 'Falha ao carregar atribuições da fila.');
  }
  const map: Record<string, QueueAssignment> = {};
  (data || []).forEach((row: QueueAssignment) => { map[row.ticket_id] = row; });
  return map;
}

function normalizeAssignment(row: QueueAssignment): QueueAssignment {
  return {
    ...row,
    status: row.status || 'pending',
    assignment_source: row.assignment_source || 'automatic',
    started_at: row.started_at || null,
    started_by: row.started_by || null,
  };
}

/** Marca atomicamente que o monitor responsável iniciou o trabalho. */
export async function startQueueTicketAssignment(
  ticketId: string,
  queueType: DistributedQueueType
): Promise<QueueAssignment> {
  if (isMockMode || !supabase) {
    return {
      ticket_id: ticketId,
      queue_type: queueType,
      assigned_to: '',
      status: 'in_progress',
      assignment_source: 'automatic',
      started_at: new Date().toISOString(),
      started_by: null,
    };
  }
  const { data, error } = await supabase.rpc('start_queue_ticket_assignment', {
    p_ticket_id: ticketId,
    p_queue_type: queueType,
  });
  if (error) throw new Error(error.message || 'Não foi possível iniciar a avaliação deste ticket.');
  const row = (data || [])[0] as QueueAssignment | undefined;
  if (!row) throw new Error('A atribuição do ticket não foi encontrada.');
  return normalizeAssignment(row);
}

/** Libera uma avaliação aberta e ainda não salva pelo próprio monitor. */
export async function releaseQueueTicketAssignment(
  ticketId: string,
  queueType: DistributedQueueType
): Promise<void> {
  if (isMockMode || !supabase) return;
  const { error } = await supabase.rpc('release_queue_ticket_assignment', {
    p_ticket_id: ticketId,
    p_queue_type: queueType,
  });
  if (error) throw new Error(error.message || 'Não foi possível liberar a atribuição do ticket.');
}

/** Transfere a responsabilidade; a RPC valida papel, elegibilidade e presença. */
export async function reassignQueueTicket(
  ticketId: string,
  queueType: DistributedQueueType,
  monitorId: string,
  confirmInProgress: boolean
): Promise<QueueAssignment> {
  if (isMockMode || !supabase) {
    return {
      ticket_id: ticketId,
      queue_type: queueType,
      assigned_to: monitorId,
      status: 'pending',
      assignment_source: 'manual',
      started_at: null,
      started_by: null,
    };
  }
  const { data, error } = await supabase.rpc('reassign_queue_ticket', {
    p_ticket_id: ticketId,
    p_queue_type: queueType,
    p_monitor_id: monitorId,
    p_confirm_in_progress: confirmInProgress,
  });
  if (error) throw new Error(error.message || 'Não foi possível alterar o monitor responsável.');
  const row = (data || [])[0] as QueueAssignment | undefined;
  if (!row) throw new Error('A atribuição atualizada não foi retornada.');
  return normalizeAssignment(row);
}
