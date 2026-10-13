import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DashboardProvider, useDashboard } from './DashboardContext';
import { clearPageCache } from '../../lib/pageCache';
import type { User } from '../../types';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ isMockMode: true, supabase: null, mockDb: { get: mocks.get } }));
vi.mock('../../lib/StaticDataContext', () => ({ useStaticData: () => ({ users: [], teams: [], forms: [], dissatisfactionFields: [] }) }));
vi.mock('../../lib/useQualityConfig', () => ({ useQualityConfig: () => ({ config: {} }) }));
const user = { id: 'dashboard-admin', role: 'admin', active: true } as User;
const wrapper = ({ children }: { children: React.ReactNode }) => <DashboardProvider user={user}>{children}</DashboardProvider>;
beforeEach(() => { clearPageCache(); mocks.get.mockReset(); });
afterEach(cleanup);

it('restores the dashboard and filters immediately, then replaces data without hiding it', async () => {
  mocks.get.mockImplementation(async (table: string) => ({ data: table === 'monitorias'
    ? [{ id: 'old', created_at: new Date().toISOString(), score: 80, team_id: 'team' }] : [] }));
  const first = renderHook(useDashboard, { wrapper });
  await waitFor(() => expect(first.result.current.loading).toBe(false));
  act(() => first.result.current.setFilters(filters => ({ ...filters, teamId: 'team' })));
  expect(first.result.current.monitorias[0]?.id).toBe('old');
  first.unmount();

  let resolve!: (value: unknown) => void;
  mocks.get.mockImplementation((table: string) => table === 'monitorias'
    ? new Promise(done => { resolve = done; }) : Promise.resolve({ data: [] }));
  const second = renderHook(useDashboard, { wrapper });
  expect(second.result.current.loading).toBe(false);
  expect(second.result.current.filters.teamId).toBe('team');
  expect(second.result.current.monitorias[0]?.id).toBe('old');
  await waitFor(() => expect(second.result.current.refreshing).toBe(true));
  expect(second.result.current.monitorias[0]?.id).toBe('old');
  await act(async () => resolve({ data: [{ id: 'new', created_at: new Date().toISOString(), score: 90, team_id: 'team' }] }));
  expect(second.result.current.monitorias[0]?.id).toBe('new');
  expect(second.result.current.loading).toBe(false);
});
