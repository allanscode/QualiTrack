import { isContestationAction } from './contestation';
import { formatTimelineDateTime } from './timeline';

export interface ContestationNotificationItem {
  id: string;
  monitoriaId: string;
  ticketId?: string;
  displayId?: string | number;
  eventTimestamp: string;
  title: string;
  message: string;
  time: string;
  type: 'contestacao';
  targetTab: 'monitorias';
  read: boolean;
}

export interface UserLike {
  id: string;
  role: string;
}

export interface MonitoriaLike {
  id: string;
  ticket_id?: string;
  display_id?: string | number;
  status: string;
  evaluator_id?: string | null;
  updated_at?: string;
  created_at?: string;
  history?: Array<{ action: string; at?: string; note?: string }>;
}

/**
 * Função pura que determina se o usuário logado deve receber a notificação
 * de uma monitoria em contestação.
 *
 * Regras:
 * - gestores de qualidade (e administradores) recebem;
 * - auditor responsável (role qualidade e id == evaluator_id) recebe;
 * - outros monitores de qualidade NÃO recebem;
 * - suporte NÃO recebe;
 * - gestor_suporte NÃO recebe.
 */
export function shouldReceiveContestationNotification(
  user: UserLike | null | undefined,
  monitoria: { evaluator_id?: string | null }
): boolean {
  if (!user) return false;
  if (user.role === 'gestor_qualidade' || user.role === 'admin') {
    return true;
  }
  if (user.role === 'qualidade') {
    return Boolean(monitoria.evaluator_id && monitoria.evaluator_id === user.id);
  }
  return false;
}

/**
 * Gera lista de notificações para monitorias no estado 'em_contestacao'.
 * Identificador estável: `contestacao-{monitoria_id}-{timestamp_do_evento}`.
 * Uma nova contestação posterior na mesma monitoria gera um novo timestamp
 * e, portanto, uma nova notificação unread.
 */
export function getContestationNotifications(
  currentUser: UserLike | null | undefined,
  monitorias: MonitoriaLike[],
  readNotificationIds: Set<string>
): ContestationNotificationItem[] {
  if (!currentUser) return [];

  const list: ContestationNotificationItem[] = [];

  for (const m of monitorias) {
    // Utiliza estritamente o estado atual 'em_contestacao' (ignora legado 'contestado')
    if (m.status !== 'em_contestacao') continue;
    if (!shouldReceiveContestationNotification(currentUser, m)) continue;

    // Localiza o último evento de contestação no histórico
    const lastContestation = [...(m.history || [])]
      .reverse()
      .find(h => isContestationAction(h.action));

    const eventTimestamp = lastContestation?.at || m.updated_at || m.created_at || '';
    const notifId = `contestacao-${m.id}-${eventTimestamp}`;

    const protocolOrTicket = m.ticket_id || m.display_id || m.id.slice(0, 6);
    const reasonText = lastContestation?.note
      ? `Motivo: "${lastContestation.note}"`
      : 'Aguardando reanálise e parecer da equipe de Qualidade.';

    list.push({
      id: notifId,
      monitoriaId: m.id,
      ticketId: m.ticket_id,
      displayId: m.display_id,
      eventTimestamp,
      title: `Contestação na Monitoria #${protocolOrTicket}`,
      message: reasonText,
      time: formatTimelineDateTime(eventTimestamp),
      type: 'contestacao',
      targetTab: 'monitorias',
      read: readNotificationIds.has(notifId),
    });
  }

  return list;
}
