import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearPageCache } from '../lib/pageCache';
import type { Monitoria, User } from '../types';
import { useMonitoriaData } from './useMonitoriaData';

const state = vi.hoisted(() => ({
  sources: {} as Record<string, Monitoria[]>,
  ranges: [] as { source: string; from: number; to: number }[],
}));

vi.mock('../lib/supabase', () => ({
  isMockMode: false,
  mockDb: {},
  supabase: {
    from: (source: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        neq: () => query,
        or: () => query,
        order: () => query,
        range: (from: number, to: number) => {
          state.ranges.push({ source, from, to });
          const all = state.sources[source] || [];
          return Promise.resolve({ data: all.slice(from, to + 1), count: all.length, error: null });
        },
      };
      return query;
    },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: () => Promise.resolve(),
  },
}));

const row = (source: string, index: number, time: number) => ({
  id: `${source}-${index}`,
  created_at: new Date(Date.UTC(2026, 9, 1, 0, time)).toISOString(),
  active: true,
}) as Monitoria;

beforeEach(() => {
  clearPageCache();
  state.sources = {};
  state.ranges = [];
});
afterEach(cleanup);

it('requests only the current 50 rows for a single-source monitoria list', async () => {
  state.sources.monitorias = Array.from({ length: 130 }, (_, index) => row('main', index, 130 - index));
  const user = { id: 'admin', role: 'admin', active: true } as User;
  const hook = renderHook(({ page }) => useMonitoriaData(user, 'monitorias', { page }), { initialProps: { page: 0 } });
  await waitFor(() => expect(hook.result.current.monitorias).toHaveLength(50));
  hook.rerender({ page: 1 });
  await waitFor(() => expect(hook.result.current.monitorias[0]?.id).toBe('main-50'));
  hook.rerender({ page: 2 });
  await waitFor(() => expect(hook.result.current.monitorias).toHaveLength(30));
  expect(hook.result.current.total).toBe(130);
  expect(state.ranges).toEqual([
    { source: 'monitorias', from: 0, to: 49 },
    { source: 'monitorias', from: 50, to: 99 },
    { source: 'monitorias', from: 100, to: 149 },
  ]);
});

it('merges reviewer rows in order with bounded requests on every page', async () => {
  state.sources.vw_monitorias_suporte = Array.from({ length: 70 }, (_, index) => row('own', index, 140 - index * 2));
  state.sources.vw_monitorias_pj_reviewer = Array.from({ length: 70 }, (_, index) => row('review', index, 139 - index * 2));
  const expected = [...state.sources.vw_monitorias_suporte, ...state.sources.vw_monitorias_pj_reviewer]
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).map(item => item.id);
  const user = { id: 'agent', role: 'suporte', active: true } as User;
  const hook = renderHook(({ page }) => useMonitoriaData(user, 'monitorias', { page }), { initialProps: { page: 0 } });
  await waitFor(() => expect(hook.result.current.monitorias).toHaveLength(50));
  expect(hook.result.current.monitorias.map(item => item.id)).toEqual(expected.slice(0, 50));
  hook.rerender({ page: 1 });
  await waitFor(() => expect(hook.result.current.monitorias[0]?.id).toBe(expected[50]));
  expect(hook.result.current.monitorias.map(item => item.id)).toEqual(expected.slice(50, 100));
  hook.rerender({ page: 2 });
  await waitFor(() => expect(hook.result.current.monitorias[0]?.id).toBe(expected[100]));
  expect(hook.result.current.monitorias.map(item => item.id)).toEqual(expected.slice(100, 140));
  expect(hook.result.current.total).toBe(140);
  expect(state.ranges).toEqual([
    { source: 'vw_monitorias_suporte', from: 0, to: 49 },
    { source: 'vw_monitorias_pj_reviewer', from: 0, to: 49 },
    { source: 'vw_monitorias_suporte', from: 25, to: 74 },
    { source: 'vw_monitorias_pj_reviewer', from: 25, to: 74 },
    { source: 'vw_monitorias_suporte', from: 50, to: 99 },
    { source: 'vw_monitorias_pj_reviewer', from: 50, to: 99 },
  ]);
});

it('continues at the correct source offsets when one source dominates the first page', async () => {
  state.sources.monitorias = Array.from({ length: 70 }, (_, index) => row('team', index, 140 - index));
  state.sources.vw_monitorias_pj_reviewer = Array.from({ length: 70 }, (_, index) => row('review', index, 70 - index));
  const user = { id: 'manager', role: 'gestor_suporte', active: true, team_ids: ['team-1'] } as User;
  const hook = renderHook(({ page }) => useMonitoriaData(user, 'monitorias', { page }), { initialProps: { page: 0 } });
  await waitFor(() => expect(hook.result.current.monitorias).toHaveLength(50));
  expect(hook.result.current.monitorias[49]?.id).toBe('team-49');
  hook.rerender({ page: 1 });
  await waitFor(() => expect(hook.result.current.monitorias[0]?.id).toBe('team-50'));
  expect(hook.result.current.monitorias[49]?.id).toBe('review-29');
  hook.rerender({ page: 2 });
  await waitFor(() => expect(hook.result.current.monitorias[0]?.id).toBe('review-30'));
  expect(hook.result.current.monitorias).toHaveLength(40);
  expect(state.ranges).toEqual([
    { source: 'monitorias', from: 0, to: 49 },
    { source: 'vw_monitorias_pj_reviewer', from: 0, to: 49 },
    { source: 'monitorias', from: 50, to: 99 },
    { source: 'vw_monitorias_pj_reviewer', from: 0, to: 49 },
    { source: 'monitorias', from: 70, to: 119 },
    { source: 'vw_monitorias_pj_reviewer', from: 30, to: 79 },
  ]);
});
