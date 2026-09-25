/**
 * Regras Críticas de Domínio do QualiTrack (WQ-22)
 *
 * Limiar fixo de conformidade:
 * - score >= 75: Válido (positiva)
 * - score < 75:  Invalidado (negativa)
 *
 * IMPORTANTE: Não utilizar config.targetScore para essa classificação.
 * O limiar de 75% é uma regra estrita de negócio e conformidade.
 */

export const QUALITY_APPROVAL_THRESHOLD = 75;

export type EvaluationClassification = 'valido' | 'invalidado';

/**
 * Retorna se a nota atingiu o limiar mínimo fixo de conformidade (>= 75%).
 */
export function isEvaluationValid(score: number | null | undefined): boolean {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return false;
  }
  return score >= QUALITY_APPROVAL_THRESHOLD;
}

/**
 * Retorna o desfecho para publicação ou classificação (positiva / negativa).
 */
export function getEvaluationOutcome(score: number | null | undefined): 'positiva' | 'negativa' {
  return isEvaluationValid(score) ? 'positiva' : 'negativa';
}

/**
 * Retorna o rótulo textual de classificação de domínio ('Válido' / 'Invalidado').
 */
export function getEvaluationClassificationLabel(score: number | null | undefined): string {
  return isEvaluationValid(score) ? 'Ticket Válido' : 'Ticket Invalidado';
}
