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

/** Explains disqualification without changing the official final score. */
export function describeAICriticalScore(evaluation: AIEvaluationResult, form: EvaluationForm | undefined) {
  if (!form) return undefined;
  const questions = [...form.sections.flatMap(section => section.questions), ...(form.critical_errors || [])];
  const critical = questions.filter(question => evaluation.suggested_critical_errors?.[question.id] === true
    || (question.is_critical && evaluation.suggested_answers[question.id] === 'NAO'));
  if (!critical.length) return undefined;
  const criteriaScore = calculateQualityScore({ ...form, sections: form.sections.map(section => ({
    ...section, questions: section.questions.map(question => ({ ...question, is_critical: false })),
  })) }, evaluation.suggested_answers, {});
  return {
    criteriaScore,
    reasons: critical.map(question => evaluation.suggested_observations?.[question.id] || question.text),
  };
}
