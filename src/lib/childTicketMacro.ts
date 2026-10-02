import type { ChildTicketAiEvaluation } from '../types';

export function buildChildTicketMacro(
  evaluation: ChildTicketAiEvaluation,
  verdict: 'conforme' | 'nao_conforme',
): string {
  const lines = [
    verdict === 'conforme' ? 'Chamado filho válido.' : 'Chamado filho inválido.',
    evaluation.summary.trim(),
  ];
  if (verdict === 'nao_conforme') {
    const adjustments = evaluation.recommendations
      .map(item => item.trim())
      .filter(Boolean);
    if (adjustments.length) lines.push(`Ajustes: ${adjustments.join('; ')}`);
  }
  return lines.filter(Boolean).join('\n');
}
