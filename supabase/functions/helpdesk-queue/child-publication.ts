export const CHILD_TICKET_FORM_ID = '6c7d1e88-841b-4da9-9a66-9f1464ce896f';
const CHILD_MACRO_FORM_IDS = new Set([
  '6c7d1e88-841b-4da9-9a66-9f1464ce8970',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8971',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8972',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8973',
]);
const isChildFormId = (id: string): boolean => id === CHILD_TICKET_FORM_ID || CHILD_MACRO_FORM_IDS.has(id);

export interface ChildPublicationMonitoria {
  id: string;
  ticket_id: string;
  form_id: string;
  score: number | null;
  answers?: Record<string, string>;
  status: string;
  active: boolean;
  evaluator_id: string;
  evaluator_note: string | null;
  form_snapshot?: {
    automation?: string;
    legacy_source?: string;
    child_ai_evaluation?: { status?: string };
    child_verdict?: 'valido' | 'invalido';
    sections?: Array<{ questions?: Array<{ id: string }> }>;
  } | null;
}

export function childPublicationVerdict(
  monitoria: ChildPublicationMonitoria | null,
): 'conforme' | 'nao_conforme' | null {
  if (!monitoria || !monitoria.active || !['concluida', 'finalizada_alterada'].includes(monitoria.status)
    || !isChildFormId(monitoria.form_id)
    || monitoria.form_snapshot?.legacy_source === 'zendesk_child_note'
    ) {
    return null;
  }
  if (CHILD_MACRO_FORM_IDS.has(monitoria.form_id)) {
    const ids = monitoria.form_snapshot?.sections?.flatMap(section => section.questions?.map(question => question.id) || []) || [];
    if (!ids.length) return null;
    return ids.every(id => monitoria.answers?.[id] === 'SIM') ? 'conforme' : 'nao_conforme';
  }
  if (monitoria.score === null || !Number.isFinite(monitoria.score) || monitoria.score < 0 || monitoria.score > 100) return null;
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
  if (!monitoria || monitoria.ticket_id !== ticketId || !isChildFormId(monitoria.form_id) || !monitoria.active) {
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
  const verdict = childPublicationVerdict(monitoria);
  if (!verdict) throw new Error('Monitoria sem veredito publicável.');
  const intro = verdict === 'nao_conforme'
    ? 'Chamado filho inválido.\n\n'
    : correctsPreviousInvalid
      ? 'Retificação: a monitoria concluída considerou este chamado filho válido. O parecer anterior permanece no histórico do ticket.\n\n'
      : 'Chamado filho válido.\n\n';
  return `${intro}Registro do Auditor da monitoria #${monitoria.id}:\n${monitoria.evaluator_note!.trim()}`;
}
