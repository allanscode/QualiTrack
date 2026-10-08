import { describe, expect, it } from 'vitest';
import type { Monitoria } from '../types';
import { buildSupportRanking, compareSupportOffenders, compareSupportRanking, selectRankingBaseline } from './supportRanking';

const evaluation = (agent: string, score: number, team = 'team-a', overrides: Partial<Monitoria> = {}): Monitoria => ({
  id: `${agent}-${score}`, evaluated_id: agent, score, team_id: team,
  created_at: '2026-10-07T12:00:00Z', active: true, ...overrides,
} as Monitoria);

describe('support ranking', () => {
  it('uses evaluation share times average, so six strong evaluations outrank one perfect evaluation', () => {
    const rows = [evaluation('one', 100), ...Array.from({ length: 6 }, () => evaluation('six', 95)),
      ...Array.from({ length: 4 }, () => evaluation('others', 60))];
    const ranking = buildSupportRanking(rows, rows, []);
    expect(ranking.map(row => row.id)).toEqual(['six', 'others', 'one']);
    const one = ranking.find(row => row.id === 'one')!;
    expect(one.rawScore).toBe(100);
    expect(one.count).toBe(1);
    expect(one.score).toBeCloseTo(100 / 11);
    expect(ranking.find(row => row.id === 'six')?.score).toBeCloseTo(570 / 11);
  });

  it('uses all teams in General and only the selected team when filtered', () => {
    const rows = [evaluation('one', 100, 'team-a'),
      ...Array.from({ length: 6 }, () => evaluation('six', 95, 'team-a')),
      evaluation('another', 100, 'team-b')];
    const general = buildSupportRanking(rows, selectRankingBaseline(rows, { teamId: '' }), []);
    expect(general.find(row => row.id === 'one')?.score).toBeCloseTo(100 / 8);
    expect(general.find(row => row.id === 'six')?.score).toBeCloseTo(570 / 8);
    expect(general.find(row => row.id === 'another')?.score).toBeCloseTo(100 / 8);
    const selected = selectRankingBaseline(rows, { teamId: 'team-a' });
    const team = buildSupportRanking(selected, selected, []);
    expect(team.find(row => row.id === 'six')?.score).toBeCloseTo(570 / 7);
    expect(team.some(row => row.id === 'another')).toBe(false);
  });

  it('ranks repeated low results by their share of points lost', () => {
    const rows = [evaluation('one', 0), ...Array.from({ length: 6 }, () => evaluation('repeat', 60))];
    const ranking = buildSupportRanking(rows, rows, []);
    expect([...ranking].sort(compareSupportOffenders).map(row => row.id)).toEqual(['repeat', 'one']);
    expect(ranking.find(row => row.id === 'repeat')?.badness).toBeCloseTo(240 / 7);
  });

  it('keeps zero scores, excludes missing/nonfinite/inactive scores and agents without evaluations', () => {
    const rows = [evaluation('zero', 0), evaluation('nan', NaN), evaluation('infinity', Infinity),
      evaluation('inactive', 100, 'team-a', { active: false }), evaluation('missing', undefined as unknown as number),
      evaluation('null', null as unknown as number)];
    expect(buildSupportRanking(rows, rows, [{ id: 'no-evaluations', name: 'Nobody' }]))
      .toMatchObject([{ id: 'zero', score: 0, count: 1, rawScore: 0 }]);
  });

  it('breaks ties consistently by volume, name and ID in both directions without rounding scores', () => {
    const rows = [evaluation('b', 80), evaluation('a', 80), evaluation('many', 80), evaluation('many', 80)];
    const ranking = buildSupportRanking(rows, rows, []);
    expect(ranking.map(row => row.id)).toEqual(['many', 'a', 'b']);
    expect([...ranking].sort((a, b) => compareSupportRanking(a, b, true)).map(row => row.id)).toEqual(['a', 'b', 'many']);
    const close = [evaluation('a', 80), evaluation('z', 80.001)];
    expect(buildSupportRanking(close, close, [])[0].id).toBe('z');
  });

  it('preserves all baseline filters except selected agent without adding rows outside RBAC input', () => {
    const base = evaluation('selected', 100, 'team-a', { evaluator_id: 'auditor', form_id: 'form', status: 'concluida', channel: 'Chat' });
    const peer = { ...base, evaluated_id: 'peer', score: 60 };
    const rows = [base, peer, { ...base, created_at: '2026-09-01T12:00:00Z' }, { ...base, team_id: 'other' },
      { ...base, evaluator_id: 'other' }, { ...base, form_id: 'other' }, { ...base, channel: 'Email' as const },
      { ...base, status: 'pendente_revisao' as const }, { ...base, active: false }];
    const baseline = selectRankingBaseline(rows, { startDate: '2026-10-01', endDate: '2026-10-31', teamId: 'team-a',
      agentId: 'selected', auditorId: 'auditor', formId: 'form', status: 'concluida', channel: 'Chat' });
    expect(baseline).toEqual([base, peer]);
    expect(buildSupportRanking([base], baseline, [])[0].score).toBeCloseTo(100 / 2);
  });

  it('returns no results for empty data', () => {
    expect(buildSupportRanking([], [], [])).toEqual([]);
  });
});
