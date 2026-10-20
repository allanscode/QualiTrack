import { isMockMode, supabase } from './supabase';
import type { UserRole } from '../types';

export const NOTIFICATION_KINDS = [
  { kind: 'contestation', label: 'Contestações', detail: 'Pareceres contestados que exigem análise.' },
  { kind: 'new_monitoria', label: 'Nova monitoria', detail: 'Avaliação disponível para o atendimento.' },
  { kind: 'feedback_pending', label: 'Feedback para ciência', detail: 'Feedback 1:1 aguardando ciência.' },
  { kind: 'feedback_ack', label: 'Ciência de feedback', detail: 'Confirmação de ciência recebida pela gestão.' },
  { kind: 'deadline', label: 'Prazo de ação', detail: 'Avisos de prazo próximo do vencimento.' },
  { kind: 'queue_negative', label: 'CSAT negativo', detail: 'Novo ticket na fila de negativas.' },
  { kind: 'queue_child_review', label: 'Filho para revisão', detail: 'Apenas chamados filhos cujo parecer requer revisão.' },
  { kind: 'manual_pending', label: 'Manual pendente', detail: 'Proposta de manual aguardando aprovação.' },
  { kind: 'manual_updated', label: 'Manual atualizado', detail: 'Nova versão de manual aprovada.' },
  { kind: 'manual_rejected', label: 'Manual devolvido', detail: 'Proposta de manual devolvida.' },
] as const;

export type NotificationKind = typeof NOTIFICATION_KINDS[number]['kind'];
export type NotificationPreferences = Partial<Record<NotificationKind, boolean>>;

const mockKey = (role: UserRole) => `qualitrack-notification-role-preferences-${role}`;

export function readMockNotificationPreferences(role: UserRole): NotificationPreferences {
  try {
    return JSON.parse(localStorage.getItem(mockKey(role)) || '{}') as NotificationPreferences;
  } catch {
    return {};
  }
}

export async function fetchRoleNotificationPreferences(role: UserRole): Promise<NotificationPreferences> {
  if (isMockMode || !supabase) return readMockNotificationPreferences(role);
  const { data, error } = await supabase.from('notification_role_preferences')
    .select('kind,enabled').eq('role', role);
  if (error) throw error;
  return Object.fromEntries((data || []).map(row => [row.kind, row.enabled])) as NotificationPreferences;
}

export async function saveRoleNotificationPreference(
  role: UserRole, kind: NotificationKind, enabled: boolean, changedBy: string,
): Promise<void> {
  if (isMockMode || !supabase) {
    localStorage.setItem(mockKey(role), JSON.stringify({
      ...readMockNotificationPreferences(role), [kind]: enabled,
    }));
  } else {
    const { error } = await supabase.from('notification_role_preferences').upsert({
      role, kind, enabled, updated_by: changedBy, updated_at: new Date().toISOString(),
    }, { onConflict: 'role,kind' });
    if (error) throw error;
  }
  window.dispatchEvent(new CustomEvent('qualitrack:notification-preferences-changed', { detail: { role } }));
}
