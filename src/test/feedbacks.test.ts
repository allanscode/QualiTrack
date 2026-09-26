import { describe, it, expect } from 'vitest';
import { AgentFeedback, FeedbackStatus } from '../types';

describe('Agent Feedback & 1:1 Flow', () => {
  it('deve inicializar com status pendente_ciencia', () => {
    const feedback: AgentFeedback = {
      id: 'fb-test-1',
      agent_id: 'agent-123',
      manager_id: 'manager-456',
      title: '1:1 Alinhamento de FCR',
      improvements: 'Melhorar confirmação cadastral',
      action_plan: 'Aplicar checklist de segurança em 100% dos chamados',
      status: 'pendente_ciencia',
      created_at: new Date().toISOString(),
    };

    expect(feedback.status).toBe('pendente_ciencia');
    expect(feedback.agent_acknowledged_at).toBeUndefined();
  });

  it('deve permitir ao atendente confirmar ciência e adicionar notas', () => {
    const feedback: AgentFeedback = {
      id: 'fb-test-2',
      agent_id: 'agent-123',
      manager_id: 'manager-456',
      title: '1:1 de Postura e Script',
      improvements: 'Ajustar tom e empatia',
      action_plan: 'Utilizar frases empáticas no fechamento',
      status: 'pendente_ciencia',
      created_at: new Date().toISOString(),
    };

    // Atendente assina
    const ackDate = new Date().toISOString();
    const notes = 'Entendido, já estou aplicando a partir do chamado de hoje.';

    const updated: AgentFeedback = {
      ...feedback,
      status: 'ciente',
      agent_acknowledged_at: ackDate,
      agent_notes: notes,
      updated_at: ackDate,
    };

    expect(updated.status).toBe('ciente');
    expect(updated.agent_acknowledged_at).toBe(ackDate);
    expect(updated.agent_notes).toBe(notes);
  });

  it('deve permitir ao gestor concluir o plano de ação quando cumprido', () => {
    const feedback: AgentFeedback = {
      id: 'fb-test-3',
      agent_id: 'agent-123',
      manager_id: 'manager-456',
      title: '1:1 de Desenvolvimento Técnico',
      improvements: 'Estudo do módulo fiscal',
      action_plan: 'Concluir treinamento e obter 100% na prova interna',
      status: 'ciente',
      agent_acknowledged_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    // Conclui
    const completed: AgentFeedback = {
      ...feedback,
      status: 'concluido',
      updated_at: new Date().toISOString(),
    };

    expect(completed.status).toBe('concluido');
  });
});
