import { EvaluationForm } from '../types';

/**
 * Interface representando as respostas da avaliação
 */
export type AnswerValue = 'SIM' | 'NAO' | 'NA';

/**
 * Calcula o Score de Qualidade de uma monitoria de forma puramente matemática
 * aplicando rigorosamente a fórmula:
 * 
 * Q = \frac{\sum_{i=1}^{n} (w_i \cdot s_i)}{\sum_{i=1}^{n} w_i}
 * 
 * @param form Snapshot do formulário de avaliação aplicado
 * @param answers Objeto com as respostas para cada ID de questão
 * @returns Score final arredondado para duas casas decimais, variando de 0 a 100
 */
export function calculateQualityScore(
  form: EvaluationForm | undefined | null,
  answers: Record<string, AnswerValue>
): number {
  if (!form || !form.sections || form.sections.length === 0) {
    return 0;
  }

  let weightedScoreSum = 0;
  let activeWeightsSum = 0;

  form.sections.forEach((section) => {
    const sectionWeight = section.weight ?? 0;
    const activeQuestions = section.questions.filter((q) => answers[q.id] !== 'NA');

    if (activeQuestions.length === 0) {
      // Se todas as questões da seção são "NA", essa seção é desconsiderada
      // e seu peso é redistribuído proporcionalmente entre as outras seções
      return;
    }

    // O peso individual de cada questão ativa é o peso da seção dividido pelo número de questões ativas
    const weightPerQuestion = sectionWeight / activeQuestions.length;

    activeQuestions.forEach((q) => {
      const s_i = answers[q.id] === 'SIM' ? 1 : 0;
      const w_i = weightPerQuestion;

      weightedScoreSum += w_i * s_i;
      activeWeightsSum += w_i;
    });
  });

  if (activeWeightsSum === 0) {
    return 100;
  }

  // Q = (Soma de w_i * s_i) / (Soma de w_i) * 100
  const score = (weightedScoreSum / activeWeightsSum) * 100;

  return Math.max(0, Math.min(100, Number(score.toFixed(2))));
}
