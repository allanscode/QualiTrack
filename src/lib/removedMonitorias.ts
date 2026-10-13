import { mockDb, supabase } from './supabase';
import type { Monitoria, User } from '../types';

export type RemovedMonitoria = Pick<Monitoria,
  'id' | 'display_id' | 'ticket_id' | 'status' | 'score' | 'evaluated_name' | 'updated_at' | 'history' | 'active'>;

export async function fetchRemovedMonitorias(ticketId = ''): Promise<RemovedMonitoria[]> {
  if (!supabase) {
    const { data, error } = await mockDb.get('monitorias');
    if (error) throw error;
    return ((data || []) as Monitoria[])
      .filter(row => row.active === false && (!ticketId || row.ticket_id?.trim() === ticketId))
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      .slice(0, 50);
  }

  let query = supabase.from('monitorias')
    .select('id,display_id,ticket_id,status,score,evaluated_name,updated_at,history,active')
    .eq('active', false)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (ticketId) query = query.eq('ticket_id', ticketId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as RemovedMonitoria[];
}

export async function restoreRemovedMonitoria(id: string, reason: string, actor: User): Promise<void> {
  const note = reason.trim();
  if (actor.role !== 'admin' || !actor.active) throw new Error('Apenas administradores ativos podem restaurar monitorias.');
  if (!note || note.length > 2000) throw new Error('Informe um motivo de até 2000 caracteres para a restauração.');

  if (supabase) {
    const { error } = await supabase.rpc('restore_removed_monitoria', {
      p_monitoria_id: id, p_reason: note,
    });
    if (error) throw error;
    return;
  }

  const { data, error } = await mockDb.get('monitorias');
  if (error) throw error;
  const rows = (data || []) as Monitoria[];
  const monitoria = rows.find(row => row.id === id && row.active === false);
  if (!monitoria) throw new Error('Monitoria removida não encontrada.');
  if (rows.some(row => row.active !== false && row.id !== id
    && row.ticket_id?.trim() === monitoria.ticket_id?.trim())) {
    throw new Error('Este ticket já possui outra monitoria ativa.');
  }
  const now = new Date().toISOString();
  const result = await mockDb.update('monitorias', id, {
    active: true,
    updated_at: now,
    history: [...(monitoria.history || []), {
      action: 'Monitoria restaurada pelo Administrador',
      by_id: actor.id, by_name: actor.name, at: now, note,
    }],
  });
  if (result.error) throw result.error;
  const assignments = await mockDb.get('queue_ticket_assignments');
  if (assignments.error) throw assignments.error;
  const updates = await Promise.all(((assignments.data || []) as Array<{ id: string; ticket_id: string; status: string }>)
    .filter(row => row.ticket_id?.trim() === monitoria.ticket_id?.trim() && ['pending', 'in_progress'].includes(row.status))
    .map(row => mockDb.update('queue_ticket_assignments', row.id, { status: 'completed', completed_at: now })));
  const failed = updates.find(update => update.error);
  if (failed?.error) throw failed.error;
}
