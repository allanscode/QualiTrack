import { describe, it, expect } from 'vitest';
import { calculateQualityScore } from '../utils/qualityMath';
import { EvaluationForm, Question } from '../types';

const createQuestion = (overrides: Partial<Question> = {}): Question => ({
  id: 'q1',
  text: 'Question',
  type: 'yes_no_na',
  ...overrides,
});

const createMockForm = (overrides: Partial<EvaluationForm> = {}): EvaluationForm => ({
  id: 'f1',
  title: 'Test Form',
  description: 'Test',
  team_id: 't1',
  createdBy: 'u1',
  created_at: new Date().toISOString(),
  active: true,
  sections: [
    {
      id: 's1',
      title: 'Section 1',
      weight: 50,
      questions: [
        createQuestion({ id: 'q1', text: 'Question 1', is_critical: false }),
        createQuestion({ id: 'q2', text: 'Question 2', is_critical: true }),
      ],
    },
    {
      id: 's2',
      title: 'Section 2',
      weight: 50,
      questions: [
        createQuestion({ id: 'q3', text: 'Question 3', is_critical: false }),
        createQuestion({ id: 'q4', text: 'Question 4', is_critical: false }),
      ],
    },
  ],
  ...overrides,
});

type Answers = Record<string, 'SIM' | 'NAO' | 'NA'>;

const answers = (obj: Record<string, string>): Answers => obj as Answers;

describe('calculateQualityScore', () => {
  describe('Cálculo normal de score ponderado', () => {
    it('deve retornar 100% quando todas respostas são SIM', () => {
      const form = createMockForm();
      const score = calculateQualityScore(form, answers({ q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' }));
      expect(score).toBe(100);
    });

    it('deve retornar 0% quando todas respostas são NAO (sem crítico)', () => {
      const form = createMockForm({
        sections: [{
          ...createMockForm().sections[0],
          questions: createMockForm().sections[0].questions.map(q => ({ ...q, is_critical: false })),
        }],
      });
      const score = calculateQualityScore(form, answers({ q1: 'NAO', q2: 'NAO', q3: 'NAO', q4: 'NAO' }));
      expect(score).toBe(0);
    });

    it('deve calcular média ponderada corretamente', () => {
      const form = createMockForm();
      const score = calculateQualityScore(form, answers({ q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO' }));
      expect(score).toBe(50);
    });

    it('deve respeitar pesos diferentes entre seções', () => {
      const form = createMockForm({
        sections: [
          { id: 's1', title: 'S1', weight: 70, questions: [createQuestion({ id: 'q1', text: 'Q1', is_critical: false })] },
          { id: 's2', title: 'S2', weight: 30, questions: [createQuestion({ id: 'q2', text: 'Q2', is_critical: false })] },
        ],
      });
      const score = calculateQualityScore(form, answers({ q1: 'SIM', q2: 'NAO' }));
      expect(score).toBe(70);
    });
  });

  describe('Exclusão de N/A do denominador', () => {
    it('deve excluir questões N/A do cálculo', () => {
      const form = createMockForm();
      const score = calculateQualityScore(form, answers({ q1: 'SIM', q2: 'NA', q3: 'SIM', q4: 'NA' }));
      expect(score).toBe(100);
    });

    it('deve redistribuir peso da seção quando todas questões são N/A', () => {
      const form = createMockForm();
      const score = calculateQualityScore(form, answers({ q1: 'NA', q2: 'NA', q3: 'SIM', q4: 'SIM' }));
      expect(score).toBe(100);
    });

    it('deve calcular corretamente com N/A misturado', () => {
      const form = createMockForm();
      const score = calculateQualityScore(form, answers({ q1: 'SIM', q2: 'NA', q3: 'NAO', q4: 'NA' }));
      expect(score).toBe(50);
    });
  });

  describe('Erro crítico → score = 0%', () => {
    it('deve retornar 0 quando questão is_critical respondida NAO', () => {
      const form = createMockForm();
      const score = calculateQualityScore(form, answers({ q1: 'SIM', q2: 'NAO', q3: 'SIM', q4: 'SIM' }));
      expect(score).toBe(0);
    });

    it('deve retornar 0 quando criticalErrors legacy marcado', () => {
      const form = createMockForm();
      const score = calculateQualityScore(form, answers({ q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' }), { ce1: true });
      expect(score).toBe(0);
    });

    it('deve retornar 0 quando múltiplos erros críticos', () => {
      const form = createMockForm();
      const score = calculateQualityScore(form, answers({ q1: 'NAO', q2: 'NAO', q3: 'SIM', q4: 'SIM' }));
      expect(score).toBe(0);
    });

    it('NÃO deve zerar se questão crítica respondida SIM', () => {
      const form = createMockForm();
      const score = calculateQualityScore(form, answers({ q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO' }));
      expect(score).toBe(50);
    });
  });

  describe('Casos de borda', () => {
    it('deve retornar 0 para form undefined', () => {
      const score = calculateQualityScore(undefined, {});
      expect(score).toBe(0);
    });

    it('deve retornar 0 para form null', () => {
      const score = calculateQualityScore(null, {});
      expect(score).toBe(0);
    });

    it('deve retornar 0 para form sem sections', () => {
      const form = createMockForm({ sections: [] });
      const score = calculateQualityScore(form, {});
      expect(score).toBe(0);
    });

    it('deve retornar 100 quando todas questões são N/A (sem pesos ativos)', () => {
      const form = createMockForm();
      const score = calculateQualityScore(form, answers({ q1: 'NA', q2: 'NA', q3: 'NA', q4: 'NA' }));
      expect(score).toBe(100);
    });

    it('deve limitar score entre 0 e 100', () => {
      const form = createMockForm();
      const score = calculateQualityScore(form, answers({ q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' }));
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('deve arredondar para 2 casas decimais', () => {
      const form = createMockForm({
        sections: [
          { id: 's1', title: 'S1', weight: 33, questions: [createQuestion({ id: 'q1', text: 'Q1', is_critical: false })] },
          { id: 's2', title: 'S2', weight: 33, questions: [createQuestion({ id: 'q2', text: 'Q2', is_critical: false })] },
          { id: 's3', title: 'S3', weight: 34, questions: [createQuestion({ id: 'q3', text: 'Q3', is_critical: false })] },
        ],
      });
      const score = calculateQualityScore(form, answers({ q1: 'SIM', q2: 'SIM', q3: 'NAO' }));
      expect(score).toBe(66);
    });
  });

  describe('Cenários complexos', () => {
    it('deve funcionar com múltiplas seções e questões variadas', () => {
      const form: EvaluationForm = {
        id: 'f1',
        title: 'Complex Form',
        description: 'Test',
        team_id: 't1',
        createdBy: 'u1',
        created_at: new Date().toISOString(),
        active: true,
        sections: [
          { id: 's1', title: 'S1', weight: 40, questions: [
            createQuestion({ id: 'q1', text: 'Q1', is_critical: false }),
            createQuestion({ id: 'q2', text: 'Q2', is_critical: false }),
            createQuestion({ id: 'q3', text: 'Q3', is_critical: true }),
          ]},
          { id: 's2', title: 'S2', weight: 60, questions: [
            createQuestion({ id: 'q4', text: 'Q4', is_critical: false }),
            createQuestion({ id: 'q5', text: 'Q5', is_critical: false }),
          ]},
        ],
        critical_errors: [],
      };
      const score = calculateQualityScore(form, answers({ q1: 'SIM', q2: 'NAO', q3: 'SIM', q4: 'SIM', q5: 'NA' }));
      expect(score).toBeCloseTo(86.67, 1);
    });
  });
});
