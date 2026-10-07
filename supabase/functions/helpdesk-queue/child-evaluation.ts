import { incompleteResponse } from './ai-fallback.ts';

export const CHILD_QUESTION_IDS = [
  'child-subject-preserved', 'child-parent-linked', 'child-macro-preserved',
  'child-macro-enriched', 'child-routing-correct',
];

export function validateChildEvaluationResponse(value: unknown): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) incompleteResponse('O parecer do chamado filho não é um objeto JSON.');
  const parsed = value as Record<string, any>;
  if (!['nova_demanda', 'analise_tecnica', 'apoio_tecnico', 'produtividade', 'desconhecido'].includes(parsed.detected_type)) {
    incompleteResponse('O parecer não contém detected_type válido.');
  }
  if (!['conforme', 'nao_conforme', 'atencao'].includes(parsed.status)) incompleteResponse('O parecer não contém status válido.');
  if (!Number.isFinite(parsed.score) || parsed.score < 0 || parsed.score > 100) incompleteResponse('O parecer não contém score válido.');
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) incompleteResponse('O parecer não contém summary válido.');
  if (!Array.isArray(parsed.checks) || parsed.checks.length !== CHILD_QUESTION_IDS.length || !parsed.checks.every((check: any) =>
    check && CHILD_QUESTION_IDS.includes(check.question_id)
    && ['SIM', 'NAO', 'NA'].includes(check.answer)
    && typeof check.rule === 'string' && check.rule.trim()
    && typeof check.passed === 'boolean' && check.passed === (check.answer === 'SIM')
    && typeof check.details === 'string' && check.details.trim())
    || new Set(parsed.checks.map((check: { question_id: string }) => check.question_id)).size !== CHILD_QUESTION_IDS.length) {
    incompleteResponse('O parecer não contém os cinco critérios da ficha completos e sem duplicação.');
  }
  if (parsed.checks.some((check: { rule: string; details: string }) => /\btag(s)?\b/i.test(`${check.rule} ${check.details}`))) {
    incompleteResponse('O parecer não deve avaliar tags dos chamados filhos.');
  }
  if (!Array.isArray(parsed.recommendations) || !parsed.recommendations.every((item: unknown) => typeof item === 'string')) {
    incompleteResponse('O parecer não contém recommendations válido.');
  }
  return parsed;
}
