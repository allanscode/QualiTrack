import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { User } from '../../types';
import { clearPageCache } from '../../lib/pageCache';
import { DashboardProvider, useDashboard } from './DashboardContext';

const mocks = vi.hoisted(() => ({ calls: [] as Array<{ source: string; columns: string; start?: string; end?: string }> }));
vi.mock('../../lib/supabase', () => {
  const rows = [
    { id: 'current', active: true, created_at: new Date().toISOString(), score: 90, form_snapshot: { name: 'current' } },
    { id: 'historic', active: true, created_at: new Date(new Date().getFullYear() - 2, 0, 15).toISOString(), score: 80, form_snapshot: { name: 'historic' } },
  ];
  const from = (source: string) => {
    let columns = '';
    let start: string | undefined;
    let end: string | undefined;
    const query = {
      select(value: string) { columns = value; return query; },
      eq() { return query; },
      not() { return query; },
      or() { return query; },
      in() { return query; },
      order() { return query; },
      range() { return query; },
      gte(_field: string, value: string) { start = value; return query; },
      lte(_field: string, value: string) { end = value; return query; },
      abortSignal() {
        mocks.calls.push({ source, columns, start, end });
        const data = rows.filter(row => (!start || row.created_at >= start) && (!end || row.created_at <= end))
          .map(row => columns.includes('form_snapshot') ? row : { id: row.id, active: row.active, created_at: row.created_at, score: row.score });
        return Promise.resolve({ data, error: null });
      },
      then(resolve: (value: { data: unknown[]; error: null }) => void) {
        mocks.calls.push({ source, columns, start, end });
        resolve({ data: [], error: null });
      },
    };
    return query;
  };
  return { isMockMode: false, supabase: { from, rpc: async () => ({ data: null, error: null }), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {} }, mockDb: {} };
});
vi.mock('../../lib/StaticDataContext', () => ({ useStaticData: () => ({ users: [], teams: [], forms: [], dissatisfactionFields: [] }) }));
vi.mock('../../lib/useQualityConfig', () => ({ useQualityConfig: () => ({ config: {} }) }));

const user = { id: 'dashboard-admin', role: 'admin', active: true } as User;
const wrapper = ({ children }: { children: React.ReactNode }) =>
  <DashboardProvider user={user} activeTab="dashboard">{children}</DashboardProvider>;

beforeEach(() => { clearPageCache(); mocks.calls.length = 0; });
afterEach(cleanup);

it('reads lightweight history and full records only for the selected period', async () => {
  const hook = renderHook(useDashboard, { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(hook.result.current.allMonitorias.map(row => row.id)).toEqual(['current']);
  expect(hook.result.current.monitorias.map(row => row.id)).toEqual(['current']);
  expect(hook.result.current.monitorias[0].form_snapshot).toEqual({ name: 'current' });

  const history = mocks.calls.find(call => call.source === 'monitorias' && !call.columns.includes('form_snapshot'));
  const details = mocks.calls.find(call => call.source === 'monitorias' && call.columns.includes('form_snapshot'));
  expect(history?.start).toBeTruthy();
  expect(history?.end).toBeTruthy();
  expect(history?.columns).not.toContain('answers');
  expect(details?.start).toBeTruthy();
  expect(details?.end).toBeTruthy();
  expect(mocks.calls.some(call => call.source === 'helpdesk_submissions')).toBe(false);

  act(() => hook.result.current.setFilters(filters => ({
    ...filters,
    startDate: `${new Date().getFullYear() - 2}-01-01`,
  })));
  await waitFor(() => expect(hook.result.current.monitorias.map(row => row.id)).toEqual(['current', 'historic']));
  await waitFor(() => expect(hook.result.current.allMonitorias.map(row => row.id)).toEqual(['current', 'historic']));
});

it('loads quality metrics from the selected period without a second history query', async () => {
  const quality = { ...user, id: 'quality-auditor', role: 'qualidade' } as User;
  const qualityWrapper = ({ children }: { children: React.ReactNode }) =>
    <DashboardProvider user={quality} activeTab="dashboard">{children}</DashboardProvider>;
  const hook = renderHook(useDashboard, { wrapper: qualityWrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(mocks.calls.filter(call => call.columns.includes('form_snapshot'))).toHaveLength(1);
  expect(mocks.calls.filter(call => call.columns.includes('form_snapshot'))[0].start).toBeTruthy();
});

it('loads helpdesk submissions only for the support manager dashboard', async () => {
  const manager = {
    id: 'support-manager', name: 'Support Manager', email: 'manager@example.test',
    created_at: new Date().toISOString(), role: 'gestor_suporte', active: true, team_ids: [],
  } as User;
  const managerWrapper = ({ children }: { children: React.ReactNode }) =>
    <DashboardProvider user={manager} activeTab="dashboard">{children}</DashboardProvider>;
  const hook = renderHook(useDashboard, { wrapper: managerWrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(mocks.calls.filter(call => call.source === 'helpdesk_submissions')).toHaveLength(1);
});

it('uses the anonymized view for both support queries', async () => {
  const support = {
    id: 'support-agent', name: 'Support Agent', email: 'support@example.test',
    created_at: new Date().toISOString(), role: 'suporte', active: true, team_ids: [],
  } as User;
  const supportWrapper = ({ children }: { children: React.ReactNode }) =>
    <DashboardProvider user={support} activeTab="dashboard">{children}</DashboardProvider>;
  const hook = renderHook(useDashboard, { wrapper: supportWrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(mocks.calls.filter(call => call.source.startsWith('monitorias') || call.source.startsWith('vw_monitorias'))
    .map(call => call.source)).toEqual(['vw_monitorias_suporte', 'vw_monitorias_suporte']);
});
