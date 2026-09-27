import { describe, it, expect } from 'vitest';
import { analyzeRootCause } from '../utils/rootCauseAnalysis';
import { Monitoria, AgentFeedback, EvaluationForm } from '../types';

describe('Root Cause & Feedback ROI Analysis', () => {
  const mockForms: EvaluationForm[] = [
    {
      id: 'f1',
      title: 'Formulário Helpdesk',
      description: 'Avaliação padrão',
      team_id: '',
      active: true,
      createdBy: 'admin',
      created_at: '2026-01-01T00:00:00Z',
      sections: [
        {
          id: 's1',
          title: 'Procedimentos Técnicos',
          weight: 50,
          questions: [
            { id: 'q1', text: 'Realizou testes de ping e rota antes de escalar', weight: 30, type: 'yes_no_na' },
            { id: 'q2', text: 'Confirmou dados cadastrais', weight: 20, type: 'yes_no_na' },
          ],
        },
      ],
    },
  ];

  it('handles empty monitorias gracefully without errors', () => {
    const result = analyzeRootCause([], mockForms, []);
    expect(result.totalAudits).toBe(0);
    expect(result.avgScore).toBe(0);
    expect(result.topQuestionOffenders).toEqual([]);
    expect(result.recommendations.length).toBe(0);
  });

  it('identifies top question offenders correctly', () => {
    const monitorias: Monitoria[] = [
      {
        id: 'm1',
        ticket_id: '101',
        score: 70,
        status: 'concluida',
        active: true,
        answers: { q1: 'NAO', q2: 'SIM' },
        created_at: '2026-09-01T10:00:00Z',
      } as any,
      {
        id: 'm2',
        ticket_id: '102',
        score: 60,
        status: 'concluida',
        active: true,
        answers: { q1: 'NAO', q2: 'NAO' },
        created_at: '2026-09-02T10:00:00Z',
      } as any,
      {
        id: 'm3',
        ticket_id: '103',
        score: 100,
        status: 'concluida',
        active: true,
        answers: { q1: 'SIM', q2: 'SIM' },
        created_at: '2026-09-03T10:00:00Z',
      } as any,
    ];

    const result = analyzeRootCause(monitorias, mockForms, []);
    expect(result.totalAudits).toBe(3);
    expect(result.avgScore).toBe(76.7);
    expect(result.topQuestionOffenders.length).toBeGreaterThan(0);
    expect(result.topQuestionOffenders[0].questionId).toBe('q1');
    expect(result.topQuestionOffenders[0].failureCount).toBe(2);
    expect(result.topQuestionOffenders[0].failureRate).toBe(66.7);
  });

  it('measures feedback ROI comparing before and after scores accurately', () => {
    const feedbacks: AgentFeedback[] = [
      {
        id: 'fb1',
        agent_id: 'agent_1',
        manager_id: 'mgr_1',
        title: 'Alinhamento de Ping e Tracert',
        improvements: 'Testar antes de escalar',
        action_plan: 'Seguir checklist',
        status: 'ciente',
        created_at: '2026-09-15T12:00:00Z',
        updated_at: '2026-09-15T12:00:00Z',
      },
    ];

    const monitorias: Monitoria[] = [
      // Antes do feedback
      {
        id: 'm1',
        evaluated_id: 'agent_1',
        evaluated_name: 'Allan Agente',
        ticket_id: '101',
        score: 70,
        active: true,
        created_at: '2026-09-10T10:00:00Z',
      } as any,
      // Depois do feedback
      {
        id: 'm2',
        evaluated_id: 'agent_1',
        evaluated_name: 'Allan Agente',
        ticket_id: '102',
        score: 95,
        active: true,
        created_at: '2026-09-20T10:00:00Z',
      } as any,
    ];

    const result = analyzeRootCause(monitorias, mockForms, feedbacks);
    expect(result.feedbackROI.totalAgentsWith1on1).toBe(1);
    expect(result.feedbackROI.overallBeforeScore).toBe(70);
    expect(result.feedbackROI.overallAfterScore).toBe(95);
    expect(result.feedbackROI.overallDelta).toBe(25);
    expect(result.feedbackROI.improvedAgentsCount).toBe(1);
  });
});
