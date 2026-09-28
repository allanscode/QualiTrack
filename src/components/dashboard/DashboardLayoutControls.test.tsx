import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLayoutControls from './DashboardLayoutControls';
import { widgetId } from '../../lib/dashboardLayout';
import { useDashboardLayoutEditor } from '../../hooks/useDashboardLayoutEditor';
import type { DashboardRole } from '../../lib/dashboardLayout';

const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  saveConfig: vi.fn(),
}));
vi.mock('../../lib/useQualityConfig', () => ({ useQualityConfig: () => state }));

function Controls({ role }: { role: DashboardRole }) {
  const editor = useDashboardLayoutEditor(role);
  return <DashboardLayoutControls editor={editor} />;
}

describe('DashboardLayoutControls', () => {
  beforeEach(() => {
    state.config = { dashboardLayouts: {}, dashboardHiddenActions: {} };
    state.saveConfig.mockReset().mockResolvedValue(undefined);
  });

  it('persists a removed card only for the selected role', async () => {
    render(<Controls role="admin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Média Geral' }));

    await waitFor(() => expect(state.saveConfig).toHaveBeenCalledOnce());
    expect(state.saveConfig.mock.calls[0][0].dashboardLayouts).toEqual({
      admin: { hidden: [widgetId('StatCard', 'Média Geral')], order: [] },
    });
  });

  it('persists each action button visibility for the selected role', async () => {
    render(<Controls role="gestor_suporte" />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Exibir Relatório Executivo (PDF)' }));

    await waitFor(() => expect(state.saveConfig).toHaveBeenCalledOnce());
    expect(state.saveConfig.mock.calls[0][0].dashboardHiddenActions).toEqual({
      gestor_suporte: ['executive_report'],
    });
  });
});
