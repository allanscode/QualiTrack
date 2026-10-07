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
  it('mantém o parecer e todos os ajustes sem repetir checklist e assunto', () => {
    const text = buildChildTicketMacro(evaluation, 'nao_conforme');
    expect(text).toContain('Chamado filho inválido.');
    expect(text).toContain(evaluation.summary);
    expect(text).toContain('Informar o pedido.; Registrar a evidência.');
    expect(text).not.toContain('Contexto');
    expect(text).toContain('Terceira recomendação.');
  });

  it('preserva integralmente respostas extensas da IA', () => {
    const summary = 'Resumo '.repeat(200);
    const recommendations = ['A'.repeat(300), 'B'.repeat(300)];
    const text = buildChildTicketMacro({ ...evaluation, summary, recommendations }, 'nao_conforme');
    expect(text).toContain(summary.trim());
    for (const recommendation of recommendations) expect(text).toContain(recommendation);
  });
});
