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

it('shows cached monitorias during background refresh and preserves them on failure', async () => {
  mocks.get.mockResolvedValue({ data: [{ id: 'old' }] });
  const first = renderHook(() => useMonitoriaData(user));
  await waitFor(() => expect(first.result.current.monitorias[0]?.id).toBe('old'));
  first.unmount();
  let reject!: (reason: Error) => void;
  mocks.get.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  const second = renderHook(() => useMonitoriaData(user));
  expect(second.result.current.loading).toBe(false);
  expect(second.result.current.monitorias[0]?.id).toBe('old');
  await act(async () => reject(new Error('offline')));
  expect(second.result.current.monitorias[0]?.id).toBe('old');
  mocks.get.mockResolvedValue({ data: [{ id: 'new' }] });
  await act(async () => second.result.current.load());
  expect(second.result.current.monitorias[0]?.id).toBe('new');
});

it('hides the previous user immediately and ignores their late response', async () => {
  let resolveOld!: (data: unknown) => void;
  mocks.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValue({ data: [{ id: 'new-user-ticket' }] });
  const hook = renderHook(({ who }) => useMonitoriaData(who), { initialProps: { who: user } });
  hook.rerender({ who: { ...user, id: 'two' } });
  await waitFor(() => expect(hook.result.current.monitorias[0]?.id).toBe('new-user-ticket'));
  await act(async () => resolveOld({ data: [{ id: 'private-old-ticket' }] }));
  expect(hook.result.current.monitorias.map(row => row.id)).toEqual(['new-user-ticket']);
});
