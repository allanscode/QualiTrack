import { describe, it, expect } from 'vitest';
import {
  QUALITY_APPROVAL_THRESHOLD,
  isEvaluationValid,
  getEvaluationOutcome,
  getEvaluationClassificationLabel,
} from './domainRules';

describe('domainRules (WQ-22)', () => {
  it('o limiar fixo deve ser 75%', () => {
    expect(QUALITY_APPROVAL_THRESHOLD).toBe(75);
  });

  it('score >= 75 deve ser considerado válido (positiva)', () => {
    expect(isEvaluationValid(75)).toBe(true);
    expect(isEvaluationValid(75.5)).toBe(true);
    expect(isEvaluationValid(100)).toBe(true);
    expect(getEvaluationOutcome(75)).toBe('positiva');
    expect(getEvaluationOutcome(100)).toBe('positiva');
    expect(getEvaluationClassificationLabel(75)).toBe('Ticket Válido');
  });

  it('score < 75 deve ser considerado invalidado (negativa)', () => {
    expect(isEvaluationValid(74.9)).toBe(false);
    expect(isEvaluationValid(74)).toBe(false);
    expect(isEvaluationValid(0)).toBe(false);
    expect(getEvaluationOutcome(74.9)).toBe('negativa');
    expect(getEvaluationOutcome(0)).toBe('negativa');
    expect(getEvaluationClassificationLabel(74.9)).toBe('Ticket Invalidado');
  });

  it('valores nulos, indefinidos ou NaN devem ser invalidados por segurança', () => {
    expect(isEvaluationValid(null)).toBe(false);
    expect(isEvaluationValid(undefined)).toBe(false);
    expect(isEvaluationValid(NaN)).toBe(false);
    expect(getEvaluationOutcome(null)).toBe('negativa');
  });
});
