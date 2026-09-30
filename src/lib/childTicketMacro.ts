import type { ChildTicketAiEvaluation } from '../types';

function shorten(value: string, limit: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

export function buildChildTicketMacro(
  evaluation: ChildTicketAiEvaluation,
  verdict: 'conforme' | 'nao_conforme',
): string {
  const lines = [
    verdict === 'conforme' ? 'Chamado filho válido.' : 'Chamado filho inválido.',
    shorten(evaluation.summary, 420),
  ];
  if (verdict === 'nao_conforme') {
    const adjustments = evaluation.recommendations
      .filter(Boolean)
      .slice(0, 2)
      .map(item => shorten(item, 110));
    if (adjustments.length) lines.push(`Ajustes: ${adjustments.join('; ')}`);
  }
  return lines.filter(Boolean).join('\n');
}
