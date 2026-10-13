import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FilterBar from './FilterBar';

const mocks = vi.hoisted(() => ({ setFilters: vi.fn() }));
vi.mock('./DashboardContext', () => ({ useDashboard: () => ({
  filters: { startDate: '2026-10-01', endDate: '2026-10-31', teamId: '', agentId: '', auditorId: '', status: '' },
  setFilters: mocks.setFilters, users: [], teams: [], forms: [], loading: false, refresh: vi.fn(),
  user: { id: 'manager', team_ids: ['pj'] }, dashboardRole: 'gestor_suporte',
  allMonitorias: [{ id: 'visible', team_id: 'pj', ticket_group_team_id: 'cf' }],
}) }));
vi.mock('../../lib/StaticDataContext', () => ({ useStaticData: () => ({ groups: [
  { id: 'cf', name: 'Cliente Final' }, { id: 'hidden', name: 'Grupo sem acesso' },
] }) }));
vi.mock('../../providers/ThemeProvider', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('../../hooks/useFeedbacks', () => ({ useFeedbacks: () => ({ feedbacks: [] }) }));
vi.mock('../../lib/useQualityConfig', () => ({ useQualityConfig: () => ({ config: {} }) }));
vi.mock('./widgets/ExecutiveReportModal', () => ({ default: () => null }));
vi.mock('./widgets/RootCauseAnalyzerModal', () => ({ default: () => null }));
afterEach(cleanup);

it('offers only groups from authorized monitorias and keeps the team filter independent', () => {
  render(<FilterBar />);
  fireEvent.click(screen.getByRole('combobox', { name: 'Grupo do atendimento' }));
  expect(screen.queryByRole('option', { name: 'Grupo sem acesso' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Cliente Final' }));
  expect(mocks.setFilters).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'cf', teamId: '', agentId: '' }));
});
