import { describe, expect, it } from 'vitest';
import type { AIEvaluationResult, EvaluationForm } from '../types';
import { calculateAIEvaluationScore } from './aiEvaluationScore';

const form: EvaluationForm = {
  id: 'form-1', title: 'Ficha principal', description: '', team_id: '', active: true,
  createdBy: 'test', created_at: '2026-09-23T00:00:00.000Z',
  sections: [{
    id: 'section-1', title: 'Atendimento', weight: 100,
    questions: Array.from({ length: 10 }, (_, index) => ({ id: `q${index + 1}`, text: `Pergunta ${index + 1}`, type: 'yes_no_na' })),
  }],
};

const evaluation = {
  score: 62,
  summary: 'Resultado da IA', strengths: [], improvements: [],
  suggested_answers: {
    q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM', q5: 'SIM', q6: 'SIM', q7: 'SIM',
    q8: 'NAO', q9: 'NAO', q10: 'NAO',
  },
  suggested_observations: {},
  suggested_critical_errors: {},
} satisfies AIEvaluationResult;

describe('calculateAIEvaluationScore', () => {
  it('uses the same weighted calculation as the official form', () => {
    expect(calculateAIEvaluationScore(evaluation, form)).toBe(70);
  });

  it('keeps the model score only as a fallback without the form', () => {
    expect(calculateAIEvaluationScore(evaluation, undefined)).toBe(62);
  });
});
