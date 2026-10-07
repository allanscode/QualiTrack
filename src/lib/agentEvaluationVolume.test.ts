import { describe, expect, it } from 'vitest';
import { getAgentEvaluationVolumes, sortAgentEvaluationVolumes } from './agentEvaluationVolume';
import { CHILD_TICKET_FORM_ID } from './childTicketForm';

const evaluation = (id: string, agent: string, result: 'Positiva' | 'Negativa' | 'Sem pesquisa' | null, score = 80) => ({
  id, evaluated_id: agent, evaluated_name: agent, form_id: 'regular', satisfaction_result: result, score, team_name: 'Equipe A',
});

describe('agent evaluation volume', () => {
  it('classifies by survey, independently from score, and accounts for every evaluation once', () => {
    const rows = [evaluation('1', 'Ana', 'Positiva', 0), evaluation('2', 'Ana', 'Negativa', 100),
      evaluation('3', 'Ana', 'Sem pesquisa'), evaluation('4', 'Ana', null),
      { ...evaluation('5', 'Ana', 'Sem pesquisa'), form_id: CHILD_TICKET_FORM_ID }];
    const [agent] = getAgentEvaluationVolumes([...rows, rows[0]], []);
    expect(agent).toMatchObject({ positive: 1, negative: 1, proactive: 1, child: 1, other: 1, total: 5 });
    expect(agent.total).toBe(agent.positive + agent.negative + agent.proactive + agent.child + agent.other);
  });

  it('excludes inactive, missing and nonfinite scores, but includes zero and pending saved evaluations', () => {
    const rows = [evaluation('1', 'A', 'Negativa', 0), { ...evaluation('2', 'A', 'Positiva'), active: false },
      evaluation('3', 'A', 'Positiva', NaN), evaluation('4', 'A', 'Positiva', Infinity),
      { ...evaluation('5', 'A', 'Positiva'), score: null as unknown as number }, evaluation('6', '', 'Positiva')];
    expect(getAgentEvaluationVolumes(rows, [{ id: 'without-evaluations', name: 'Nobody' }])).toMatchObject([{ id: 'A', total: 1, negative: 1 }]);
  });

  it('groups by agent identity and preserves multiple teams without adding unscoped agents', () => {
    const rows = [evaluation('1', 'A', 'Positiva'), { ...evaluation('2', 'A', 'Negativa'), team_name: 'Equipe B' }, evaluation('3', 'B', 'Sem pesquisa')];
    const result = getAgentEvaluationVolumes(rows, [{ id: 'A', name: 'Same name' }, { id: 'B', name: 'Same name' }, { id: 'C', name: 'Outside' }]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'A', name: 'Same name', teams: ['Equipe A', 'Equipe B'], total: 2 });
    expect(result[1]).toMatchObject({ id: 'B', total: 1 });
  });

  it('orders by all four measures and reverses direction without mutating input', () => {
    const agents = [
      { id: 'A', name: 'Ana', teams: [], positive: 4, negative: 0, proactive: 0, child: 0, other: 0, total: 4 },
      { id: 'B', name: 'Bruno', teams: [], positive: 0, negative: 5, proactive: 0, child: 0, other: 0, total: 5 },
      { id: 'C', name: 'Caio', teams: [], positive: 0, negative: 0, proactive: 6, child: 0, other: 0, total: 6 },
    ];
    expect(sortAgentEvaluationVolumes(agents, 'total')[0].id).toBe('C');
    expect(sortAgentEvaluationVolumes(agents, 'negative')[0].id).toBe('B');
    expect(sortAgentEvaluationVolumes(agents, 'positive')[0].id).toBe('A');
    expect(sortAgentEvaluationVolumes(agents, 'proactive')[0].id).toBe('C');
    expect(sortAgentEvaluationVolumes(agents, 'total', true)[0].id).toBe('A');
    expect(agents.map(agent => agent.id)).toEqual(['A', 'B', 'C']);
  });

  it('uses deterministic tie breaks and returns empty rankings for empty filters', () => {
    const agents = getAgentEvaluationVolumes([evaluation('1', 'B', 'Positiva'), evaluation('2', 'A', 'Positiva')], []);
    expect(sortAgentEvaluationVolumes(agents, 'total').map(agent => agent.id)).toEqual(['A', 'B']);
    expect(getAgentEvaluationVolumes([], [])).toEqual([]);
  });
});
