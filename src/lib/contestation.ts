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
  return action.includes('Contestação') || lower.includes('contestou') || lower.includes('solicitou reavaliação');
}

export function isResolutionAction(action: string): boolean {
  // Excluir notas de reavaliação que contêm keywords mas não são resoluções formais
  if (action.startsWith('Monitoria Reavaliada') || action.startsWith('Reavaliação:')) return false;
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

export function countContestationOutcomes(monitorias: Monitoria[]): { accepted: number; rejected: number; total: number } {
  const contested = getContestedMonitorias(monitorias);
  let accepted = 0;
  let rejected = 0;
  contested.forEach(m => {
    if (m.contestation_result === 'approved') { accepted++; return; }
    if (m.contestation_result === 'rejected') { rejected++; return; }
    const last = getLastResolution(m.history);
    if (!last) return;
    if (isApprovalAction(last.action)) accepted++;
    else if (isRejectionAction(last.action)) rejected++;
  });
  return { accepted, rejected, total: contested.length };
}
