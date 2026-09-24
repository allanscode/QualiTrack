import { describe, expect, it } from 'vitest';
import { buildAuditorRecordPrompt, parseAuditorRecordResponse } from './auditor-record';

describe('geração do registro do auditor', () => {
  it('usa somente observações atuais não vazias e inclui erros críticos selecionados', () => {
    const prompt = buildAuditorRecordPrompt({
      ticketId: '171370',
      score: 72,
      sections: [{
        title: 'Processo',
        questions: [
          { id: 'q1', text: 'Investigou a causa?' },
          { id: 'q2', text: 'Registrou a solução?' },
        ],
      }],
      criticalErrorQuestions: [{ id: 'ce1', text: 'Encerrou incorretamente' }],
      answers: { q1: 'NAO', q2: 'SIM' },
      observations: { q1: 'Não investigou o erro relatado.', q2: '   ' },
      criticalErrors: { ce1: true, ce2: true },
      criticalErrorObservations: { ce1: 'Ticket marcado como resolvido sem solução.' },
    });

    expect(prompt).toContain('Não investigou o erro relatado.');
    expect(prompt).not.toContain('Registrou a solução?');
    expect(prompt).toContain('Encerrou incorretamente');
    expect(prompt).toContain('Ticket marcado como resolvido sem solução.');
    expect(prompt).not.toContain('Erro crítico ce2');
  });

  it('normaliza para um parágrafo e rejeita resposta vazia ou excessiva', () => {
    expect(parseAuditorRecordResponse({ auditor_record: '  Registro revisado.\n\nCom conclusão.  ' }))
      .toBe('Registro revisado. Com conclusão.');
    expect(() => parseAuditorRecordResponse({ auditor_record: ' ' })).toThrow('registro vazio');
    expect(() => parseAuditorRecordResponse({ auditor_record: 'a'.repeat(3001) })).toThrow('maior que o limite');
    expect(() => parseAuditorRecordResponse(null)).toThrow('registro válido');
  });
});
