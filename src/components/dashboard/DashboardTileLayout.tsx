import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ComponentType, ReactNode } from 'react';
import { DashboardStateContext } from './DashboardContext';
import { useQualityConfig } from '../../lib/useQualityConfig';
import { DASHBOARD_WIDGETS, orderedWidgets, widgetId } from '../../lib/dashboardLayout';
import type { DashboardRole, DashboardWidgetDefinition, DashboardWidgetType } from '../../lib/dashboardLayout';

interface LayoutContextValue {
  role: DashboardRole;
  arranged: boolean;
  slots: Record<string, HTMLDivElement>;
  registerSlot: (id: string, node: HTMLDivElement | null) => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

function Slot({ item, registerSlot }: { item: DashboardWidgetDefinition; registerSlot: LayoutContextValue['registerSlot'] }) {
  const ref = useCallback((node: HTMLDivElement | null) => registerSlot(item.id, node), [item.id, registerSlot]);
  const size = item.type === 'StatCard'
    ? 'min-h-32'
    : item.type === 'RecentAuditsTable' || item.type === 'FeedbacksWidget' || item.type === 'QualityAchievementsWidget' || item.type === 'NegativeCallsTrainingAlert'
      ? 'sm:col-span-2 xl:col-span-4'
      : item.type === 'TrendChart' || item.type === 'OfensoresChart' || item.type === 'ComparativeBarChart'
        ? 'sm:col-span-2 xl:col-span-4 h-[380px]'
        : 'sm:col-span-2 h-[360px]';
  return <div ref={ref} data-dashboard-slot={item.id} className={`min-w-0 ${size}`} />;
}

export function DashboardTileLayout({ role, children }: { role: DashboardRole; children: ReactNode }) {
  const { config } = useQualityConfig();
  const layout = config.dashboardLayouts?.[role];
  const arranged = Boolean(layout?.order?.length);
  const [slots, setSlots] = useState<Record<string, HTMLDivElement>>({});
  const registerSlot = useCallback((id: string, node: HTMLDivElement | null) => {
    setSlots(current => {
      if (node === current[id]) return current;
      if (!node && !current[id]) return current;
      const next = { ...current };
      if (node) next[id] = node;
      else delete next[id];
      return next;
    });
  }, []);
  const context = useMemo(() => ({ role, arranged, slots, registerSlot }), [role, arranged, slots, registerSlot]);
  const visibleWidgets = orderedWidgets(role, layout).filter(item => !layout?.hidden?.includes(item.id));

  return (
    <LayoutContext value={context}>
      {arranged && (
        <div className="dashboard-tile-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6" aria-label="Indicadores do dashboard">
          {visibleWidgets.map(item => <Slot key={item.id} item={item} registerSlot={registerSlot} />)}
        </div>
      )}
      <div className={arranged ? 'dashboard-tile-source' : ''}>{children}</div>
    </LayoutContext>
  );
}

interface TileProps {
  title?: string;
  profile?: string;
}

export function DashboardTile({ type, title, profile, children }: TileProps & { type: DashboardWidgetType; title: string; children: ReactNode }) {
    const layoutContext = useContext(LayoutContext);
    const dashboardState = useContext(DashboardStateContext);
    const { config } = useQualityConfig();
    const role = layoutContext?.role || (profile as DashboardRole | undefined) || dashboardState?.dashboardRole;
    const id = widgetId(type, title);
    if (role && config.dashboardLayouts?.[role]?.hidden?.includes(id)) return null;
    if (layoutContext?.arranged && DASHBOARD_WIDGETS[layoutContext.role].some(item => item.id === id)) {
      const slot = layoutContext.slots[id];
      return slot ? createPortal(children, slot) : null;
    }
    return children;
}

export function withDashboardTile<P extends TileProps>(Component: ComponentType<P>, type: DashboardWidgetType, defaultTitle?: string) {
  function DashboardTileComponent(props: P) {
    return (
      <DashboardTile type={type} title={props.title || defaultTitle || ''} profile={props.profile}>
        {createElement(Component, props)}
      </DashboardTile>
    );
  }
  DashboardTileComponent.displayName = `DashboardTile(${Component.displayName || Component.name})`;
  return DashboardTileComponent;
}
