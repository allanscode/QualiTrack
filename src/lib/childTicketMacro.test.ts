import { describe, expect, it } from 'vitest';
import { buildChildTicketMacro } from './childTicketMacro';
import type { ChildTicketAiEvaluation } from '../types';

const evaluation: ChildTicketAiEvaluation = {
  detected_type: 'nova_demanda',
  status: 'nao_conforme',
  score: 40,
  summary: 'O encaminhamento não descreveu o pedido do cliente.',
  checks: [{ rule: 'Contexto', passed: false, details: 'Faltou o contexto.' }],
  recommendations: ['Informar o pedido.', 'Registrar a evidência.', 'Terceira recomendação.'],
};

describe('macro de chamado filho', () => {
  it('mantém o parecer e até dois ajustes sem repetir checklist e assunto', () => {
    const text = buildChildTicketMacro(evaluation, 'nao_conforme');
    expect(text).toContain('Chamado filho inválido.');
    expect(text).toContain(evaluation.summary);
    expect(text).toContain('Informar o pedido.; Registrar a evidência.');
    expect(text).not.toContain('Contexto');
    expect(text).not.toContain('Terceira recomendação.');
  });

  it('limita o tamanho mesmo com respostas extensas da IA', () => {
    const text = buildChildTicketMacro({ ...evaluation, summary: 'Resumo '.repeat(200), recommendations: ['A'.repeat(300), 'B'.repeat(300)] }, 'nao_conforme');
    expect(text.length).toBeLessThan(700);
  });
});
