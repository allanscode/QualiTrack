import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardTile, DashboardTileLayout } from './DashboardTileLayout';
import { DASHBOARD_WIDGETS, orderedWidgets, widgetId } from '../../lib/dashboardLayout';
import { useDashboardLayoutEditor } from '../../hooks/useDashboardLayoutEditor';

const state = vi.hoisted(() => ({ config: {} as Record<string, unknown>, saveConfig: vi.fn() }));
vi.mock('../../lib/useQualityConfig', () => ({ useQualityConfig: () => state }));

function EditableLayout() {
  const editor = useDashboardLayoutEditor('admin');
  return (
    <DashboardTileLayout role="admin" editor={editor}>
      <DashboardTile type="StatCard" title="Média Geral"><span>card média</span></DashboardTile>
      <DashboardTile type="StatCard" title="Total"><span>card total</span></DashboardTile>
    </DashboardTileLayout>
  );
}

describe('DashboardTileLayout', () => {
  beforeEach(() => {
    state.config = { dashboardLayouts: {}, dashboardHiddenActions: {} };
    state.saveConfig.mockReset().mockResolvedValue(undefined);
  });

  it('moves widgets into the saved order and hides removed items', async () => {
    const first = widgetId('StatCard', 'Média Geral');
    const second = widgetId('StatCard', 'Total');
    const hidden = widgetId('StatCard', 'Índice de Excelência');
    state.config = { dashboardLayouts: { admin: { order: [second, first], hidden: [hidden] } } };

    const { container } = render(
      <DashboardTileLayout role="admin">
        <DashboardTile type="StatCard" title="Média Geral"><span>card média</span></DashboardTile>
        <DashboardTile type="StatCard" title="Total"><span>card total</span></DashboardTile>
        <DashboardTile type="StatCard" title="Índice de Excelência"><span>card oculto</span></DashboardTile>
      </DashboardTileLayout>
    );

    await waitFor(() => expect(screen.getByText('card total')).toBeTruthy());
    const visible = [...container.querySelectorAll('[data-dashboard-slot]')]
      .filter(slot => slot.textContent?.startsWith('card'))
      .map(slot => slot.textContent);
    expect(visible).toEqual(['card total', 'card média']);
    expect(screen.queryByText('card oculto')).toBeNull();
  });

  it('keeps each role catalog independent', () => {
    expect(orderedWidgets('admin').some(item => item.id === widgetId('FeedbacksWidget', 'Feedbacks & Gestão de 1:1'))).toBe(true);
    expect(DASHBOARD_WIDGETS.suporte.some(item => item.id === widgetId('FeedbacksWidget', 'Meus Feedbacks & Planos 1:1'))).toBe(true);
    expect(DASHBOARD_WIDGETS.qualidade.some(item => item.type === 'FeedbacksWidget')).toBe(false);
  });

  it('reorders cards by dragging directly in the preview', async () => {
    const { container } = render(<EditableLayout />);
    const first = container.querySelector(`[data-dashboard-slot="${widgetId('StatCard', 'Média Geral')}"]`);
    const second = container.querySelector(`[data-dashboard-slot="${widgetId('StatCard', 'Total')}"]`);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => { data.set(type, value); },
      getData: (type: string) => data.get(type) || '',
      effectAllowed: 'move',
      dropEffect: 'move',
    };

    fireEvent.dragStart(first!, { dataTransfer });
    fireEvent.dragOver(second!, { dataTransfer });
    fireEvent.drop(second!, { dataTransfer });

    await waitFor(() => expect(state.saveConfig).toHaveBeenCalledOnce());
    const saved = state.saveConfig.mock.calls[0][0].dashboardLayouts.admin;
    expect(saved.order.slice(0, 3)).toEqual([
      widgetId('StatCard', 'Índice de Excelência'),
      widgetId('StatCard', 'Total'),
      widgetId('StatCard', 'Média Geral'),
    ]);
  });

  it('shows move and remove controls on preview cards', async () => {
    render(<EditableLayout />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Média Geral da prévia' }));

    await waitFor(() => expect(state.saveConfig).toHaveBeenCalledOnce());
    expect(state.saveConfig.mock.calls[0][0].dashboardLayouts.admin.hidden).toEqual([widgetId('StatCard', 'Média Geral')]);
    expect(screen.getByRole('button', { name: 'Mover Total para baixo na prévia' })).toBeTruthy();
  });
});
