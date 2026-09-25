/**
 * Utilitários para Linha do Tempo das Monitorias (WQ-23)
 * Formatação consistente de data/hora no fuso America/Sao_Paulo
 * e anonimização de auditor para perfis de suporte.
 */

const SAO_PAULO_TZ = 'America/Sao_Paulo';

const timelineDateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: SAO_PAULO_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parseToValidDate(value?: string | number | Date | null): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formata data e hora para exibição na linha do tempo no formato:
 * 25/09/2026 às 17:21
 * Utiliza o fuso America/Sao_Paulo para consistência entre clientes.
 * Se a data principal for inválida ou ausente, recorre ao fallbackDate.
 */
export function formatTimelineDateTime(
  date?: string | number | Date | null,
  fallbackDate?: string | number | Date | null
): string {
  const target = parseToValidDate(date) ?? parseToValidDate(fallbackDate);
  if (!target) return '—';

  try {
    const parts = timelineDateTimeFormatter.formatToParts(target);
    const day = parts.find(p => p.type === 'day')?.value ?? '00';
    const month = parts.find(p => p.type === 'month')?.value ?? '00';
    const year = parts.find(p => p.type === 'year')?.value ?? '0000';
    const hour = parts.find(p => p.type === 'hour')?.value ?? '00';
    const minute = parts.find(p => p.type === 'minute')?.value ?? '00';

    return `${day}/${month}/${year} às ${hour}:${minute}`;
  } catch {
    return '—';
  }
}

export interface TimelineUserLike {
  id: string;
  role: string;
  name?: string;
}

/**
 * Garante o anonimato de membros da equipe de qualidade quando a tela
 * for visualizada por atendentes de suporte ou gestores de suporte.
 */
export function resolveTimelineActor(
  byId?: string | null,
  byName?: string | null,
  users?: TimelineUserLike[],
  currentUserRole?: string
): string {
  const isSupportView = currentUserRole === 'suporte' || currentUserRole === 'gestor_suporte';
  const actor = users?.find(u => u.id === byId);
  const isQualityActor = actor && ['qualidade', 'gestor_qualidade'].includes(actor.role);

  if (isSupportView && isQualityActor) {
    return 'Equipe de Qualidade';
  }
  return byName || 'Usuário';
}
