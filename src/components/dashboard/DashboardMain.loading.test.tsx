import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import DashboardMain from './DashboardMain';
import type { User } from '../../types';

vi.mock('./DashboardContext', () => ({
  DashboardProvider: ({ children }: { children: React.ReactNode }) => children,
  useDashboard: () => ({ loading: true }),
}));
vi.mock('./DashboardTileLayout', () => ({ DashboardTileLayout: ({ children }: { children: React.ReactNode }) => <div style={{ display: 'none' }}>{children}</div> }));
vi.mock('./FilterBar', () => ({ default: () => null }));
vi.mock('./roles/AgentDashboard', () => ({ default: () => null }));
vi.mock('./roles/QualityDashboard', () => ({ default: () => null }));
vi.mock('./roles/SupportManagerDashboard', () => ({ default: () => null }));
vi.mock('./roles/QualityManagerDashboard', () => ({ default: () => null }));
vi.mock('./roles/AdminDashboard', () => ({ default: () => null }));

it('renders the skeleton outside the hidden dashboard portal source', () => {
  render(<DashboardMain user={{ id: 'admin', role: 'admin' } as User} />);
  expect(screen.getByRole('status', { name: 'Carregando dashboard' })).toBeVisible();
});
