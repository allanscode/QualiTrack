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
      const orders: { field: keyof Monitoria; ascending: boolean }[] = [];
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        neq: () => query,
        or: () => query,
        order: (field: keyof Monitoria, options: { ascending: boolean }) => {
          orders.push({ field, ascending: options.ascending });
          return query;
        },
        range: (from: number, to: number) => {
          state.ranges.push({ source, from, to });
          const all = [...(state.sources[source] || [])].sort((a, b) => {
            for (const { field, ascending } of orders) {
              const left = a[field];
              const right = b[field];
              if (left == null && right != null) return 1;
              if (left != null && right == null) return -1;
              if (left == null || right == null) continue;
              const result = typeof left === 'number' && typeof right === 'number'
                ? left - right : String(left).localeCompare(String(right));
              if (result) return ascending ? result : -result;
            }
            return 0;
          });
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

it('sorts scores from the authorized support view without querying the legacy reviewer view', async () => {
  state.sources.vw_monitorias_suporte = Array.from({ length: 60 }, (_, index) => ({
    ...row('own', index, index), score: index,
  }));
  const user = { id: 'agent', role: 'suporte', active: true } as User;
  const hook = renderHook(({ page, direction }) => useMonitoriaData(user, 'monitorias', {
    page, filters: { sortField: 'score', sortDirection: direction as 'asc' | 'desc' },
  }), { initialProps: { page: 0, direction: 'asc' } });
  await waitFor(() => expect(hook.result.current.monitorias.map(item => item.score)).toEqual(Array.from({ length: 50 }, (_, index) => index)));
  hook.rerender({ page: 1, direction: 'asc' });
  await waitFor(() => expect(hook.result.current.monitorias[0]?.score).toBe(50));
  expect(hook.result.current.monitorias).toHaveLength(10);
  hook.rerender({ page: 0, direction: 'desc' });
  await waitFor(() => expect(hook.result.current.monitorias[0]?.score).toBe(59));
  expect(hook.result.current.monitorias[49]?.score).toBe(10);
  expect(state.ranges).toEqual([
    { source: 'vw_monitorias_suporte', from: 0, to: 49 },
    { source: 'vw_monitorias_suporte', from: 50, to: 99 },
    { source: 'vw_monitorias_suporte', from: 0, to: 49 },
  ]);
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

it('paginates support-manager monitorias from the assigned teams only', async () => {
  state.sources.monitorias = Array.from({ length: 70 }, (_, index) => row('team', index, 140 - index));
  const user = { id: 'manager', role: 'gestor_suporte', active: true, team_ids: ['team-1'] } as User;
  const hook = renderHook(({ page }) => useMonitoriaData(user, 'monitorias', { page }), { initialProps: { page: 0 } });
  await waitFor(() => expect(hook.result.current.monitorias).toHaveLength(50));
  expect(hook.result.current.monitorias[49]?.id).toBe('team-49');
  hook.rerender({ page: 1 });
  await waitFor(() => expect(hook.result.current.monitorias[0]?.id).toBe('team-50'));
  expect(hook.result.current.monitorias).toHaveLength(20);
  expect(state.ranges).toEqual([
    { source: 'monitorias', from: 0, to: 49 },
    { source: 'monitorias', from: 50, to: 99 },
  ]);
});
