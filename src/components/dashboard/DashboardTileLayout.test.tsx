import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardTile, DashboardTileLayout } from './DashboardTileLayout';
import { DASHBOARD_WIDGETS, orderedWidgets, widgetId } from '../../lib/dashboardLayout';

const state = vi.hoisted(() => ({ config: {} as Record<string, unknown> }));
vi.mock('../../lib/useQualityConfig', () => ({ useQualityConfig: () => state }));

describe('DashboardTileLayout', () => {
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
});
