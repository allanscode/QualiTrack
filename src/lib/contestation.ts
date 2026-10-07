import type { Monitoria } from '@/src/types';

const APPROVAL_KEYWORDS = ['procedente', 'aceita', 'reavaliada', 'alterada', 'alterado'];
const REJECTION_KEYWORDS = ['improcedente', 'mantida', 'negada', 'recusada'];

// Palavras que contêm keywords de aprovação mas são na verdade rejeição
const FALSE_POSITIVE_APPROVAL = ['improcedente'];

function isFalsePositiveApproval(action: string): boolean {
  const lower = action.toLowerCase();
  return FALSE_POSITIVE_APPROVAL.some(kw => lower.includes(kw));
}

export function isApprovalAction(action: string): boolean {
  const lower = action.toLowerCase();
  if (isFalsePositiveApproval(action)) return false;
  return APPROVAL_KEYWORDS.some(kw => lower.includes(kw));
}

export function isRejectionAction(action: string): boolean {
  const lower = action.toLowerCase();
  if (action.includes('Improcedente') || action.includes('Mantida')) return true;
  return REJECTION_KEYWORDS.some(kw => lower.includes(kw));
}

export function isContestationAction(action: string): boolean {
  const lower = action.toLowerCase();
  return /contest(a|o)/.test(lower) || lower.includes('reavaliação solicitada') || lower.includes('solicitou reavaliação');
}

export function isResolutionAction(action: string): boolean {
  // Excluir notas de reavaliação que contêm keywords mas não são resoluções formais
  if (action.startsWith('Monitoria Reavaliada') || action.startsWith('Reavaliação:') || action.startsWith('Gestor PJ encaminhou')) return false;
  return isApprovalAction(action) || isRejectionAction(action);
}

export function resolveContestationResult(action: string): 'approved' | 'rejected' | null {
  // Verificar rejeição primeiro para casos de false positive (ex: "Improcedente" contém "procedente")
  if (isRejectionAction(action)) return 'rejected';
  if (isApprovalAction(action)) return 'approved';
  return null;
}

export function getContestedMonitorias(monitorias: Monitoria[]): Monitoria[] {
  return monitorias.filter(m =>
    m.history?.some(h => isContestationAction(h.action))
  );
}

export function getLastResolution(history: Monitoria['history']): { action: string } | null {
  if (!history || history.length === 0) return null;
  const resolutions = history.filter(h => isResolutionAction(h.action));
  if (resolutions.length === 0) return null;
  return resolutions[resolutions.length - 1];
}

/** O parecer final de uma reavaliação é a mudança de nota, não o aceite administrativo posterior. */
export function getContestationOutcome(monitoria: Monitoria): 'approved' | 'rejected' | null {
  if (monitoria.contestation_result === 'approved' || monitoria.contestation_result === 'rejected') {
    return monitoria.contestation_result;
  }
  if (monitoria.status === 'concluida' || monitoria.status === 'finalizada_alterada') {
    const reevaluation = [...(monitoria.history || [])].reverse().find(entry =>
      entry.action.toLowerCase().includes('monitoria reavaliada'));
    const scoreChange = reevaluation?.note?.match(/\[DE\s+([\d.,]+)%?\s+PARA\s+([\d.,]+)%?\]/i);
    if (scoreChange) {
      const before = Number(scoreChange[1].replace(',', '.'));
      const after = Number(scoreChange[2].replace(',', '.'));
      if (Number.isFinite(before) && Number.isFinite(after)) return before === after ? 'rejected' : 'approved';
    }
  }
  const last = getLastResolution(monitoria.history);
  if (!last) return null;
  return isRejectionAction(last.action) ? 'rejected' : 'approved';
}

export function countContestationOutcomes(monitorias: Monitoria[]): { accepted: number; rejected: number; total: number } {
  const contested = getContestedMonitorias(monitorias);
  let accepted = 0;
  let rejected = 0;
  contested.forEach(m => {
    const outcome = getContestationOutcome(m);
    if (outcome === 'approved') accepted++;
    else if (outcome === 'rejected') rejected++;
  });
  return { accepted, rejected, total: contested.length };
}
