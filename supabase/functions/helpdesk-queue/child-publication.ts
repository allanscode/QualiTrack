export const CHILD_TICKET_FORM_ID = '6c7d1e88-841b-4da9-9a66-9f1464ce896f';

export interface ChildPublicationMonitoria {
  id: string;
  ticket_id: string;
  form_id: string;
  score: number;
  status: string;
  active: boolean;
  evaluator_id: string;
  evaluator_note: string | null;
  form_snapshot?: {
    automation?: string;
    legacy_source?: string;
    child_ai_evaluation?: { status?: string };
  } | null;
}

export function childPublicationVerdict(
  monitoria: ChildPublicationMonitoria | null,
): 'conforme' | 'nao_conforme' | null {
  if (!monitoria || !monitoria.active || !['concluida', 'finalizada_alterada'].includes(monitoria.status)
    || monitoria.form_id !== CHILD_TICKET_FORM_ID
    || monitoria.form_snapshot?.legacy_source === 'zendesk_child_note'
    || !Number.isFinite(monitoria.score) || monitoria.score < 0 || monitoria.score > 100) {
    return null;
  }
  if (monitoria.form_snapshot?.automation === 'child_ticket') {
    return monitoria.form_snapshot?.child_ai_evaluation?.status === 'conforme' ? 'conforme' : null;
  }
  return monitoria.score >= 75 ? 'conforme' : 'nao_conforme';
}

export function childPublicationError(
  monitoria: ChildPublicationMonitoria | null,
  ticketId: string,
  userId: string,
  role: string,
): string | null {
  if (!monitoria || monitoria.ticket_id !== ticketId || monitoria.form_id !== CHILD_TICKET_FORM_ID || !monitoria.active) {
    return 'Salve a ficha oficial deste chamado filho antes de enviar a macro.';
  }
  if (role === 'qualidade' && monitoria.evaluator_id !== userId) {
    return 'Apenas o auditor responsável pode publicar esta monitoria.';
  }
  if (!childPublicationVerdict(monitoria)) {
    return 'A macro só pode ser enviada após a conclusão de uma monitoria de chamado filho.';
  }
  if (!monitoria.evaluator_note?.trim()) {
    return 'Preencha o Registro do Auditor na ficha antes de publicar a macro.';
  }
  if (monitoria.evaluator_note.trim().length > 11000) {
    return 'O Registro do Auditor excede o tamanho aceito pela macro.';
  }
  return null;
}

export function childPublicationText(monitoria: ChildPublicationMonitoria, correctsPreviousInvalid = false): string {
  const verdict = childPublicationVerdict(monitoria) ?? (monitoria.score >= 75 ? 'conforme' : 'nao_conforme');
  const intro = verdict === 'nao_conforme'
    ? 'Chamado filho inválido.\n\n'
    : correctsPreviousInvalid
      ? 'Retificação: a monitoria concluída considerou este chamado filho válido. O parecer anterior permanece no histórico do ticket.\n\n'
      : 'Chamado filho válido.\n\n';
  return `${intro}Registro do Auditor da monitoria #${monitoria.id}:\n${monitoria.evaluator_note!.trim()}`;
}
