import { isMockMode, supabase } from './supabase';
import type { AuditingQueueTicket } from '../types';

export type PositiveAutomationStatus = 'pending' | 'preparing' | 'evaluating' | 'review_required' | 'blocked';
export interface PositiveAutomationItem {
  ticket_id: string;
  ticket_snapshot: AuditingQueueTicket;
  status: PositiveAutomationStatus;
  last_error?: string | null;
  score?: number | null;
}
const visibleStatuses: PositiveAutomationStatus[] = ['pending','preparing','evaluating','review_required','blocked'];

/** The durable intake survives changes to Zendesk's live view and is readable
 * only by the quality team. No transcript or worker payload is requested here. */
export async function fetchPositiveAutomation(queue: 'positivas' | 'filhos' = 'positivas'): Promise<PositiveAutomationItem[]> {
  const kind = queue === 'filhos' ? 'child' : 'positive';
  if (isMockMode || !supabase) {
    try {
      const rows = JSON.parse(localStorage.getItem(`qualitrack-${kind}-ai-queue`) || '[]') as PositiveAutomationItem[];
      return rows.filter(row => visibleStatuses.includes(row.status));
    } catch { return []; }
  }
  const rows: PositiveAutomationItem[] = [];
  for (let offset=0; ; offset+=500) {
    const {data,error} = await supabase.from(`${kind}_ai_queue`)
      .select('ticket_id,ticket_snapshot,status,last_error,score').in('status',visibleStatuses)
      .order('created_at',{ascending:true}).range(offset,offset+499);
    if (error) throw new Error(`Falha ao consultar avaliações automáticas: ${error.message}`);
    rows.push(...(data || []) as PositiveAutomationItem[]);
    if (!data || data.length<500) return rows;
  }
}

export function mergePositiveAutomation(
  tickets: AuditingQueueTicket[], rows: PositiveAutomationItem[], auditedIds: Set<string | undefined>, search?: string,
  queue: 'positivas' | 'filhos' = 'positivas',
): AuditingQueueTicket[] {
  const metadata = queue === 'filhos' ? 'child_automation' : 'positive_automation';
  const visible = new Map(rows.filter(row => !auditedIds.has(row.ticket_id)).map(row=>[row.ticket_id,row]));
  const merged = new Map(tickets.filter(ticket => !auditedIds.has(ticket.ticket_id)
    && (!ticket[metadata] || visible.has(ticket.ticket_id) || ticket.saved_ai_draft))
    .map(ticket=>[ticket.ticket_id,ticket]));
  const term=search?.trim().toLocaleLowerCase('pt-BR');
  for (const row of visible.values()) {
    const previous=merged.get(row.ticket_id);
    const ticket: AuditingQueueTicket = {
      ...row.ticket_snapshot,...previous,ticket_id:row.ticket_id,
      [metadata]:{status:row.status,last_error:row.last_error || undefined},
    };
    if (!ticket.subject) ticket.subject=`Ticket #${row.ticket_id}`;
    if (!term || [ticket.ticket_id,ticket.subject,ticket.agent_name,ticket.agent_email]
      .some(value=>value?.toLocaleLowerCase('pt-BR').includes(term))) merged.set(row.ticket_id,ticket);
  }
  return [...merged.values()];
}

export function positiveAutomationLabel(status: PositiveAutomationStatus): string {
  switch (status) {
    case 'pending': return 'Salvo · aguardando IA';
    case 'preparing': return 'Preparando avaliação automática';
    case 'evaluating': return 'IA avaliando em segundo plano';
    case 'review_required': return 'Avaliação salva · conferir parecer';
    case 'blocked': return 'Automação aguardando conferência';
  }
}
