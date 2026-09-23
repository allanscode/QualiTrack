import type { AIEvaluationResult, EvaluationForm } from '../types';
import { calculateQualityScore } from './qualityMath';

/** Uses the official form formula for every pre-launch score display. */
export function calculateAIEvaluationScore(
  evaluation: AIEvaluationResult,
  form: EvaluationForm | undefined,
): number {
  if (!form) return evaluation.score;

  return calculateQualityScore(
    form,
    evaluation.suggested_answers,
    evaluation.suggested_critical_errors,
  );
}
