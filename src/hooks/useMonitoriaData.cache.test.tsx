import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMonitoriaData } from './useMonitoriaData';
import { clearPageCache } from '../lib/pageCache';
import type { User } from '../types';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/supabase', () => ({ isMockMode: true, supabase: null, mockDb: { get: mocks.get } }));
const user = { id: 'one', role: 'admin', active: true } as User;
beforeEach(() => { clearPageCache(); mocks.get.mockReset(); });
afterEach(cleanup);

it('loads only on the monitorias tab and limits a mock page to 50 active rows', async () => {
  mocks.get.mockResolvedValue({ data: Array.from({ length: 80 }, (_, index) => ({
    id: `row-${index}`, active: index !== 0, created_at: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
  })) });
  const hook = renderHook(({ tab, page }) => useMonitoriaData(user, tab, { page }), {
    initialProps: { tab: 'dashboard', page: 0 },
  });
  expect(mocks.get).not.toHaveBeenCalled();
  hook.rerender({ tab: 'monitorias', page: 0 });
  await waitFor(() => expect(hook.result.current.monitorias).toHaveLength(50));
  expect(hook.result.current.total).toBe(79);
  expect(hook.result.current.monitorias.every(row => row.active)).toBe(true);
  hook.rerender({ tab: 'monitorias', page: 1 });
  await waitFor(() => expect(hook.result.current.monitorias).toHaveLength(29));
});

it('shows cached monitorias during background refresh and preserves them on failure', async () => {
  mocks.get.mockResolvedValue({ data: [{ id: 'old', created_at: '2026-10-01T00:00:00Z', active: true }] });
  const first = renderHook(() => useMonitoriaData(user, 'monitorias'));
  await waitFor(() => expect(first.result.current.monitorias[0]?.id).toBe('old'));
  first.unmount();
  let reject!: (reason: Error) => void;
  mocks.get.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  const second = renderHook(() => useMonitoriaData(user, 'monitorias'));
  expect(second.result.current.loading).toBe(false);
  expect(second.result.current.monitorias[0]?.id).toBe('old');
  await act(async () => reject(new Error('offline')));
  expect(second.result.current.monitorias[0]?.id).toBe('old');
  mocks.get.mockResolvedValue({ data: [{ id: 'new', created_at: '2026-10-02T00:00:00Z', active: true }] });
  await act(async () => second.result.current.load());
  expect(second.result.current.monitorias[0]?.id).toBe('new');
});

it('hides the previous user immediately and ignores their late response', async () => {
  let resolveOld!: (data: unknown) => void;
  mocks.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValue({ data: [{ id: 'new-user-ticket', created_at: '2026-10-02T00:00:00Z', active: true }] });
  const hook = renderHook(({ who }) => useMonitoriaData(who, 'monitorias'), { initialProps: { who: user } });
  hook.rerender({ who: { ...user, id: 'two' } });
  await waitFor(() => expect(hook.result.current.monitorias[0]?.id).toBe('new-user-ticket'));
  await act(async () => resolveOld({ data: [{ id: 'private-old-ticket', created_at: '2026-10-01T00:00:00Z', active: true }] }));
  expect(hook.result.current.monitorias.map(row => row.id)).toEqual(['new-user-ticket']);
});
